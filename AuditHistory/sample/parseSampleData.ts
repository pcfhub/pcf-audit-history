/**
 * The `sampleData` input — a JSON history the control renders instead of
 * asking Dataverse. It exists for the hub's demo, whose harness has no Web
 * API, and it never throws: a document the parser cannot read is `null`,
 * which the control names, rather than a blank control.
 *
 *   { "table": "account", "column": "name",
 *     "auditing": { "org": true, "table": true },
 *     "changes": [ { "id": "a1", "when": "2026-09-18T14:05:00Z", "whenText": "9/18/2026 2:05 PM",
 *                    "who": "Alex Chen", "action": 2,
 *                    "changes": [ { "column": "name", "old": "Contoso", "new": "Contoso Ltd" } ] },
 *                  { "id": "a2", "when": "…", "who": "…", "action": 14,
 *                    "share": { "principal": "Priya Raman", "old": "None", "new": "ReadAccess" } } ] }
 */

import { AuditRow, Change, Detail } from '../audit/types';
import { isTruncated } from '../audit/diff';
import { isLogicalName } from '../audit/query';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SampleHistory {
    table: string;
    column: string;
    auditing: { org: boolean; table: boolean };
    rows: AuditRow[];
    details: Record<string, Detail>;
    /** Optional display names for columns, so the demo reads like a form. */
    labels: Record<string, string>;
}

/** Rows beyond this are dropped — a demo document, not a history. */
export const SAMPLE_MAX = 500;

const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

function toChange(raw: any): Change | null {
    const column = str(raw?.column).toLowerCase();

    if (!isLogicalName(column)) {
        return null;
    }

    const oldText = raw.old === null || raw.old === undefined ? '' : String(raw.old);
    const newText = raw.new === null || raw.new === undefined ? '' : String(raw.new);

    return {
        column,
        kind: oldText === '' ? 'set' : newText === '' ? 'cleared' : 'changed',
        oldText,
        newText,
        truncated: isTruncated(oldText) || isTruncated(newText),
    };
}

function toDetail(raw: any): Detail {
    if (raw?.share && typeof raw.share === 'object') {
        return {
            kind: 'share',
            principal: str(raw.share.principal),
            oldPrivileges: str(raw.share.old),
            newPrivileges: str(raw.share.new),
        };
    }

    if (raw?.relationship && typeof raw.relationship === 'object') {
        return {
            kind: 'relationship',
            name: str(raw.relationship.name),
            targets: Array.isArray(raw.relationship.targets) ? raw.relationship.targets.map(String) : [],
        };
    }

    const changes: Change[] = Array.isArray(raw?.changes)
        ? raw.changes.map(toChange).filter((change: Change | null): change is Change => change !== null)
        : [];

    return { kind: 'attributes', changes };
}

/** A blank input is "no sample" — `undefined` — and a bad one is `null`. */
export function parseSampleData(text: string | null | undefined): SampleHistory | null | undefined {
    if (typeof text !== 'string' || text.trim() === '') {
        return undefined;
    }

    let parsed: any;

    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.changes)) {
        return null;
    }

    const rows: AuditRow[] = [];
    const details: Record<string, Detail> = {};

    parsed.changes.slice(0, SAMPLE_MAX).forEach((raw: any, index: number) => {
        if (!raw || typeof raw !== 'object') {
            return;
        }

        const id = str(raw.id, `sample-${index + 1}`).toLowerCase();

        if (rows.some((row) => row.id === id)) {
            return;
        }

        const action = Number(raw.action);

        rows.push({
            id,
            when: str(raw.when),
            whenText: str(raw.whenText, str(raw.when)),
            who: str(raw.who),
            whoId: null,
            action: Number.isFinite(action) ? action : 2,
            actionText: str(raw.actionText),
        });
        details[id] = toDetail(raw);
    });

    const labels: Record<string, string> = {};

    if (parsed.labels && typeof parsed.labels === 'object') {
        for (const key of Object.keys(parsed.labels)) {
            if (isLogicalName(key.toLowerCase()) && typeof parsed.labels[key] === 'string') {
                labels[key.toLowerCase()] = parsed.labels[key];
            }
        }
    }

    const table = str(parsed.table, 'account').toLowerCase();
    const column = str(parsed.column).toLowerCase();

    return {
        table: isLogicalName(table) ? table : 'account',
        column: isLogicalName(column) ? column : '',
        auditing: {
            org: parsed.auditing?.org !== false,
            table: parsed.auditing?.table !== false,
        },
        rows,
        details,
        labels,
    };
}
