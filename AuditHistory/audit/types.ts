/**
 * The shapes the rest of the control reads. Everything here is what the
 * control *decided*, never what the wire carried — the wire's shapes live in
 * `rows.ts` and `diff.ts`, which are the only two files that read them.
 */

/** One row of the `audit` table, as the list shows it. */
export interface AuditRow {
    /** `auditid`, bare and lower-case. */
    id: string;
    /** `createdon` as the server sent it — an ISO instant. */
    when: string;
    /** The platform's own formatting of `createdon`, in the user's zone and locale; `''` when it sent none. */
    whenText: string;
    /** The user's display name, `''` when the platform sent none. */
    who: string;
    /** `_userid_value`, or `null`. */
    whoId: string | null;
    /** The `action` code — 1 Create, 2 Update, 41 Set State … */
    action: number;
    /** The platform's own label for the action, `''` when it sent none. */
    actionText: string;
}

export type ChangeKind = 'set' | 'changed' | 'cleared';

/** One column's old value beside its new one. */
export interface Change {
    /** The column's logical name, lookups folded from `_x_value` to `x`. */
    column: string;
    kind: ChangeKind;
    /** What to show — the platform's formatted value when it sent one, the raw value otherwise, `''` when absent. */
    oldText: string;
    newText: string;
    /** Either value ends in the ellipsis the server appends at 5 KB. */
    truncated: boolean;
}

/** What `RetrieveAuditDetails` said, by the `@odata.type` it came with. */
export type Detail =
    | { kind: 'attributes'; changes: Change[] }
    | { kind: 'share'; principal: string; oldPrivileges: string; newPrivileges: string }
    | { kind: 'relationship'; name: string; targets: string[] }
    | { kind: 'other'; type: string };

/** How the next page is asked for. */
export type Cursor =
    | { kind: 'nextLink'; url: string }
    | { kind: 'keyset'; before: string };

export interface AuditPage {
    rows: AuditRow[];
    next: Cursor | null;
    /** The whole history's size when the source knows it, else `null`. */
    total: number | null;
}

/** Why a source refused, in the two ways the control tells apart. */
export interface SourceFault {
    message: string;
    /** The user lacks a privilege — a different sentence from "could not be loaded". */
    privilege: boolean;
}
