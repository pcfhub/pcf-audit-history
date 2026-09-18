/**
 * The `audit` table's rows as `retrieveMultipleRecords('audit', …)` hands
 * them over — the Web API's own shape, annotations beside values — reduced
 * to what the list shows. This is the only file that knows those key names.
 */

import { AuditRow } from './types';

export const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

export type Row = Record<string, unknown>;

export function bareId(value: unknown): string | null {
    if (typeof value !== 'string' || value === '') {
        return null;
    }

    return value.replace(/[{}]/g, '').toLowerCase();
}

function text(row: Row, key: string): string {
    const value = row[key];

    return typeof value === 'string' ? value : '';
}

/** A row without an `auditid` is not a row; everything else degrades to `''`. */
export function toRow(row: Row): AuditRow | null {
    const id = bareId(row.auditid);

    if (id === null) {
        return null;
    }

    const action = typeof row.action === 'number' ? row.action : Number(row.action);

    return {
        id,
        when: text(row, 'createdon'),
        whenText: text(row, `createdon${FORMATTED}`),
        who: text(row, `_userid_value${FORMATTED}`),
        whoId: bareId(row._userid_value),
        action: Number.isFinite(action) ? action : 0,
        actionText: text(row, `action${FORMATTED}`),
    };
}

export function toRows(rows: Row[]): AuditRow[] {
    return rows.map(toRow).filter((row): row is AuditRow => row !== null);
}
