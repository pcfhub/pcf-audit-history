/**
 * The write half: one interface, two routes. The component hands over the
 * lines the user confirmed and never knows which route answered — the live
 * one goes through `webAPI.updateRecord` with the payload `audit/restore.ts`
 * planned, the sample one puts the value back into the sample document and
 * prepends the restore as a row, so the hub's demo shows what a restore
 * looks like without a Dataverse behind it.
 */

import { AuditRow, Change, Detail, SourceFault } from '../audit/types';
import { plan, targetsOf } from '../audit/restore';
import { toFault } from './AuditSource';
import { SampleHistory } from '../sample/parseSampleData';

export interface Restorer {
    /** Writes the old side of every line back. Rejects with a `SourceFault`. */
    restore(changes: Change[]): Promise<void>;
}

/** The narrowest write API the control uses, so the suite can hand in the rig's. */
export interface WriteApi {
    updateRecord(entity: string, id: string, data: Record<string, unknown>): Promise<unknown>;
}

export interface LiveRestoreOptions {
    webAPI: WriteApi;
    table: string;
    recordId: string;
    /** The entity set of a lookup's target table — `getEntityMetadata(target).EntitySetName`, never guessed. */
    entitySet: (table: string) => Promise<string | null>;
}

/** The live route: the entity sets the lines need, then one `updateRecord` with the planned payload. */
export function createLiveRestorer(o: LiveRestoreOptions): Restorer {
    return {
        restore: (changes) => {
            const targets = targetsOf(changes);

            return Promise.all(targets.map((target) => o.entitySet(target).then((set) => [target, set] as const, () => [target, null] as const)))
                .then((pairs) => {
                    const sets: Record<string, string> = {};

                    for (const [target, set] of pairs) {
                        if (set !== null) {
                            sets[target] = set;
                        }
                    }

                    const planned = plan(changes, sets);

                    if (planned.refused.length > 0) {
                        return Promise.reject<void>({
                            message: `No entity set for ${planned.refused.join(', ')}.`,
                            privilege: false,
                        } as SourceFault);
                    }

                    if (planned.columns.length === 0) {
                        return undefined;
                    }

                    return o.webAPI.updateRecord(o.table, o.recordId, planned.payload).then(
                        () => undefined,
                        (error) => Promise.reject(toFault(error)),
                    );
                });
        },
    };
}

export interface SampleRestoreOptions {
    /** Who the restore row names. */
    who: string;
    /** The instant the row carries, and its text. */
    now: () => { when: string; whenText: string };
}

/**
 * The demo route: the restore becomes the newest row of the sample — an
 * Update by `who`, the restored lines with their sides swapped — and the
 * sample's rows are mutated in place, because the source reads them on
 * every page.
 */
export function createSampleRestorer(sample: SampleHistory, o: SampleRestoreOptions): Restorer {
    let count = 0;

    return {
        restore: (changes) => {
            if (changes.length === 0) {
                return Promise.resolve();
            }

            const at = o.now();
            const id = `restore-${(count += 1)}`;
            const detail: Detail = {
                kind: 'attributes',
                changes: changes.map((change): Change => {
                    const oldText = change.newText;
                    const newText = change.oldText;
                    const swapped: Change = {
                        column: change.column,
                        kind: oldText === '' ? 'set' : newText === '' ? 'cleared' : 'changed',
                        oldText,
                        newText,
                        truncated: false,
                    };

                    if (oldText !== '') {
                        swapped.oldRaw = oldText;
                    }

                    if (newText !== '') {
                        swapped.newRaw = newText;
                    }

                    return swapped;
                }),
            };
            const row: AuditRow = {
                id,
                when: at.when,
                whenText: at.whenText,
                who: o.who,
                whoId: null,
                action: 2,
                actionText: '',
            };

            sample.rows.unshift(row);
            sample.details[id] = detail;

            return Promise.resolve();
        },
    };
}
