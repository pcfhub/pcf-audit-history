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

import { Change, ChangeKind, Detail } from './types';
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

/** A bag's columns and what to show for each — formatted value first, raw value second. */
function readBag(bag: unknown): Map<string, string> {
    const out = new Map<string, string>();

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

        if (value === null || value === undefined) {
            // A key present as null is a cleared column: keep it, as ''.
            out.set(column, '');
            continue;
        }

        out.set(column, typeof formatted === 'string' ? formatted : String(value));
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

    return columns
        .map((column): Change => {
            const oldText = olds.get(column);
            const newText = gone.includes(column) ? '' : news.get(column);

            return {
                column,
                kind: kindOf(oldText, newText),
                oldText: oldText ?? '',
                newText: newText ?? '',
                truncated: isTruncated(oldText ?? '') || isTruncated(newText ?? ''),
            };
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
