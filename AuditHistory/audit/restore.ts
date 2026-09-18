/**
 * What a restore is, decided without a host: which lines of a change can be
 * put back, and the exact payload `webAPI.updateRecord` receives for them.
 * Nothing here talks to a host — the writer in `data/Restorer.ts` resolves
 * the entity sets and sends what this file planned.
 *
 * A restore writes the **old** side of a line. For a line whose old side
 * was empty (`set`) that is a clear, which is what the platform's own
 * *Restore* did too. It is offered only on an **Update** row: a Create has
 * nothing to go back to, and an Assign or a Set State is an operation with
 * cascades behind it, not a value.
 */

import { Change, RawValue } from './types';

/** The `action` code a restore is offered on. */
export const RESTORE_ACTION = 2;

/**
 * Columns never offered, whatever the row says. State and status are
 * changed by Set State, the owner by Assign; the rest are the platform's
 * own bookkeeping, which the Web API refuses to take.
 */
const NEVER = new Set([
    'statecode', 'statuscode',
    'ownerid', 'owninguser', 'owningteam', 'owningbusinessunit',
    'createdon', 'createdby', 'createdonbehalfby',
    'modifiedon', 'modifiedby', 'modifiedonbehalfby',
    'versionnumber', 'importsequencenumber', 'overriddencreatedon',
]);

/** Why a line is not restorable. */
export type Refusal =
    | 'action'          // not an Update
    | 'column'          // a column the platform will not take, or a composite
    | 'truncated'       // the old value was cut at 5 KB — writing it back would write the cut
    | 'no-old-side'     // the old side is unknown, and it was not a set
    | 'not-updatable'   // the metadata says IsValidForUpdate is false
    | 'lookup-unnamed'; // a lookup whose annotations did not come, so there is no key to bind

/** `null` when the line can be restored. `updatable` is the metadata's answer, `null` when unknown. */
export function refusal(change: Change, action: number, updatable: boolean | null): Refusal | null {
    if (action !== RESTORE_ACTION) {
        return 'action';
    }

    if (NEVER.has(change.column) || change.column.endsWith('_composite') || change.column.endsWith('_base')) {
        return 'column';
    }

    if (updatable === false) {
        return 'not-updatable';
    }

    if (change.truncated) {
        return 'truncated';
    }

    if (change.oldRaw === undefined && change.kind !== 'set') {
        return 'no-old-side';
    }

    if (change.lookup && (change.lookup.navigationProperty === '' || change.lookup.target === '')) {
        return 'lookup-unnamed';
    }

    return null;
}

export type Updatable = (column: string) => boolean | null;

/** The lines of a change that can be restored. */
export function restorable(changes: Change[], action: number, updatable: Updatable): Change[] {
    return changes.filter((change) => refusal(change, action, updatable(change.column)) === null);
}

/** The lookup target tables a set of lines needs entity sets for. */
export function targetsOf(changes: Change[]): string[] {
    const out: string[] = [];

    for (const change of changes) {
        if (change.lookup && change.lookup.target !== '' && change.oldRaw !== null && change.oldRaw !== undefined && !out.includes(change.lookup.target)) {
            out.push(change.lookup.target);
        }
    }

    return out;
}

export interface Plan {
    /** What `updateRecord` receives. */
    payload: Record<string, RawValue>;
    /** The columns the payload writes, in the lines' order. */
    columns: string[];
    /** Lines that could not be planned — a lookup whose target's entity set is unknown. */
    refused: string[];
}

/**
 * The payload for a set of lines. A primitive goes back as the wire's own
 * value — a date as its string, a choice as its integer, a money as its
 * number — and an old side that was empty goes back as `null`. A lookup is
 * `<navigationProperty>@odata.bind` with `/<entitySet>(<guid>)`, or `null`
 * to clear; `entitySets` maps a target table to its set, and a target it
 * does not name refuses the line rather than guessing `${table}s`.
 */
export function plan(changes: Change[], entitySets: Record<string, string>): Plan {
    const payload: Record<string, RawValue> = {};
    const columns: string[] = [];
    const refused: string[] = [];

    for (const change of changes) {
        const value: RawValue = change.oldRaw === undefined ? null : change.oldRaw;

        if (!change.lookup) {
            payload[change.column] = value;
            columns.push(change.column);
            continue;
        }

        const key = `${change.lookup.navigationProperty}@odata.bind`;

        if (value === null) {
            payload[key] = null;
            columns.push(change.column);
            continue;
        }

        const set = entitySets[change.lookup.target];

        if (typeof set !== 'string' || set === '') {
            refused.push(change.column);
            continue;
        }

        payload[key] = `/${set}(${String(value).replace(/[{}]/g, '').toLowerCase()})`;
        columns.push(change.column);
    }

    return { payload, columns, refused };
}
