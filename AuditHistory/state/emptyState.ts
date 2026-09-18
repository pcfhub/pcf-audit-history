/**
 * Which sentence an empty list gets. The order is the order a maker fixes
 * things in: the environment before the table, the table before the record,
 * a refusal before any of them — because a user who cannot read the audit
 * table cannot be told whether auditing is on.
 */

import { Enabled } from './reducer';

export type EmptyState =
    | 'no-privilege'
    | 'error'
    | 'audit-off-org'
    | 'audit-off-table'
    | 'no-changes-for-column'
    | 'no-changes'
    | null;

export interface EmptyInput {
    /** `'ok'` when the first page arrived, else why it did not. */
    outcome: 'ok' | 'privilege' | 'error';
    /** Rows loaded, before any scope. */
    rowCount: number;
    /** Rows the scope leaves visible. */
    visibleCount: number;
    /** A column scope is in force. */
    scoped: boolean;
    enabled: Enabled;
}

export function resolveEmpty(input: EmptyInput): EmptyState {
    if (input.outcome === 'privilege') {
        return 'no-privilege';
    }

    if (input.outcome === 'error') {
        return 'error';
    }

    if (input.visibleCount > 0) {
        return null;
    }

    if (input.rowCount === 0) {
        // `null` means the host could not say — then "no changes" is the
        // honest sentence, not a guess about the configuration.
        if (input.enabled.org === false) {
            return 'audit-off-org';
        }

        if (input.enabled.table === false) {
            return 'audit-off-table';
        }
    }

    return input.scoped ? 'no-changes-for-column' : 'no-changes';
}
