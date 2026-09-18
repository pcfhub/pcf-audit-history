/**
 * `RetrieveAuditDetails`' answer — an `AuditDetail` of one of five shapes —
 * reduced to what the row shows when it opens. Only `AttributeAuditDetail`
 * carries old and new column values; the others are named for what they are
 * rather than rendered as an empty change.
 *
 * The one thing this file decides that the wire does not say outright is
 * **what "cleared" looks like**. Learn's own sample shows a set lookup as
 * `OldValue: {}` and `NewValue: { … }`; the reverse, a column cleared, is
 * modelled here as the key present in `OldValue` and either absent from
 * `NewValue` or `null` there, or named in `DeletedAttributes.Keys`. SPEC.md
 * P5 records what the form actually sent, and this follows it.
 */

import { Change, ChangeKind, Detail, LookupRef, RawValue } from './types';
import { FORMATTED } from './rows';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Learn: large values are capped at "5KB or about 5,000 characters" and end in an ellipsis. */
export const CAP_HINT = 4000;

const ELLIPSIS = /(…|\.\.\.)$/;

/** The logical name under an annotation key, a lookup folded from `_x_value` to `x`. */
function columnOf(key: string): string | null {
    if (key.startsWith('@')) {
        return null;
    }

    const base = key.split('@')[0];
    const lookup = base.match(/^_(.+)_value$/);

    return (lookup ? lookup[1] : base).toLowerCase();
}

export const LOOKUP_NAME = '@Microsoft.Dynamics.CRM.lookuplogicalname';
export const NAVIGATION = '@Microsoft.Dynamics.CRM.associatednavigationproperty';

/** One side of one column: what to show, what the wire carried, and a lookup's annotations. */
interface Side {
    text: string;
    raw: RawValue;
    lookup: LookupRef | null;
}

function rawOf(value: unknown): RawValue {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;
}

/**
 * A bag's columns, each with what to show — formatted value first, raw
 * value second — beside the raw value itself and, for a lookup, the two
 * annotations a write of it needs (measured with them on the form under
 * `Prefer`, SPEC.md P4/P5).
 */
function readBag(bag: unknown): Map<string, Side> {
    const out = new Map<string, Side>();

    if (!bag || typeof bag !== 'object') {
        return out;
    }

    const record = bag as Record<string, unknown>;

    for (const key of Object.keys(record)) {
        const column = columnOf(key);

        if (column === null || key.includes('@')) {
            continue;
        }

        const value = record[key];
        const formatted = record[`${key}${FORMATTED}`];
        const navigation = record[`${key}${NAVIGATION}`];
        const target = record[`${key}${LOOKUP_NAME}`];
        // A `_x_value` key is a lookup whether or not the annotations came —
        // a lookup without them is still not a string column, and a restore
        // has to refuse it by name rather than write a GUID into it.
        const lookup: LookupRef | null = /^_.+_value$/.test(key)
            ? {
                navigationProperty: typeof navigation === 'string' ? navigation : '',
                target: typeof target === 'string' ? target.toLowerCase() : '',
            }
            : null;

        if (value === null || value === undefined) {
            // A key present as null is a cleared column: keep it, as ''.
            out.set(column, { text: '', raw: null, lookup });
            continue;
        }

        out.set(column, {
            text: typeof formatted === 'string' ? formatted : String(value),
            raw: rawOf(value),
            lookup,
        });
    }

    return out;
}

export function isTruncated(text: string): boolean {
    return text.length >= CAP_HINT && ELLIPSIS.test(text);
}

function kindOf(oldText: string | undefined, newText: string | undefined): ChangeKind {
    if (oldText === undefined || oldText === '') {
        return 'set';
    }

    return newText === undefined || newText === '' ? 'cleared' : 'changed';
}

/** Old ∪ new, in the order the new bag names them, then the ones only the old bag had. */
export function diffAttributes(oldBag: unknown, newBag: unknown, deleted: unknown): Change[] {
    const olds = readBag(oldBag);
    const news = readBag(newBag);
    const gone: string[] = Array.isArray(deleted)
        ? deleted.filter((key): key is string => typeof key === 'string').map((key) => key.toLowerCase())
        : [];
    const columns: string[] = [];

    for (const column of [...news.keys(), ...olds.keys(), ...gone]) {
        if (!columns.includes(column)) {
            columns.push(column);
        }
    }

    /*
     * A money column comes with its base-currency shadow — `creditlimit`
     * and `creditlimit_base`, measured (P5, run 2) — and the shadow is the
     * same change in the organisation's currency, not a second one.
     */
    const shown = columns.filter((column) => !(column.endsWith('_base') && columns.includes(column.slice(0, -5))));

    return shown
        .map((column): Change => {
            const oldSide = olds.get(column);
            const newSide = news.get(column);
            const oldText = oldSide?.text;
            const newText = gone.includes(column) ? '' : newSide?.text;
            // A cleared lookup has the key on the new side with no
            // annotations, so the side that names the navigation property
            // wins over the side that merely has the key.
            const lookup = [newSide?.lookup, oldSide?.lookup].find((ref) => ref && ref.navigationProperty !== '')
                ?? newSide?.lookup ?? oldSide?.lookup;
            const change: Change = {
                column,
                kind: kindOf(oldText, newText),
                oldText: oldText ?? '',
                newText: newText ?? '',
                truncated: isTruncated(oldText ?? '') || isTruncated(newText ?? ''),
            };

            // The raw sides ride along only where the wire had the key, so a
            // restore can tell "was empty" (absent) from "was cleared" (null)
            // — both are written back as null, but only one is a change.
            if (oldSide) {
                change.oldRaw = oldSide.raw;
            }

            if (gone.includes(column)) {
                change.newRaw = null;
            } else if (newSide) {
                change.newRaw = newSide.raw;
            }

            if (lookup) {
                change.lookup = lookup;
            }

            return change;
        })
        // A column named in both bags with the same text is noise the server
        // sometimes sends (a lookup re-set to itself); it is not a change.
        .filter((change) => !(change.kind === 'changed' && change.oldText === change.newText));
}

function nameOf(record: any): string {
    if (!record || typeof record !== 'object') {
        return '';
    }

    for (const key of ['fullname', 'name', 'subject', 'title']) {
        if (typeof record[key] === 'string' && record[key] !== '') {
            return record[key];
        }
    }

    const formatted = Object.keys(record).find((key) => key.endsWith(FORMATTED));

    return formatted ? String(record[formatted]) : '';
}

/** The `AuditDetail` object — `body.AuditDetail`, or the detail itself when a caller already unwrapped it. */
export function diffDetail(body: unknown): Detail {
    const detail: any = body && typeof body === 'object' && 'AuditDetail' in (body as object)
        ? (body as any).AuditDetail
        : body;
    const type: string = typeof detail?.['@odata.type'] === 'string' ? detail['@odata.type'] : '';

    if (/ShareAuditDetail$/.test(type)) {
        return {
            kind: 'share',
            principal: nameOf(detail.Principal),
            oldPrivileges: typeof detail.OldPrivileges === 'string' ? detail.OldPrivileges : '',
            newPrivileges: typeof detail.NewPrivileges === 'string' ? detail.NewPrivileges : '',
        };
    }

    if (/RelationshipAuditDetail$/.test(type)) {
        return {
            kind: 'relationship',
            name: typeof detail.RelationshipName === 'string' ? detail.RelationshipName : '',
            targets: Array.isArray(detail.TargetRecords) ? detail.TargetRecords.map(nameOf).filter(Boolean) : [],
        };
    }

    if (type === '' || /AttributeAuditDetail$/.test(type) || detail?.OldValue || detail?.NewValue) {
        return {
            kind: 'attributes',
            changes: diffAttributes(detail?.OldValue, detail?.NewValue, detail?.DeletedAttributes?.Keys),
        };
    }

    return { kind: 'other', type: type.replace(/^#Microsoft\.Dynamics\.CRM\./, '') };
}

/** The columns a detail touched — what the column filter is built from. */
export function columnsOf(detail: Detail): string[] {
    return detail.kind === 'attributes' ? detail.changes.map((change) => change.column) : [];
}
