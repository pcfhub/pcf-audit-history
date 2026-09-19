/**
 * The exact strings sent to the platform, in one place, so a spelling is
 * decided once and asserted once. Nothing here talks to a host.
 *
 * Two of the measurements in SPEC.md decided what is here. The `audit` table
 * **ignores `maxPageSize`** (P2/P3: fifteen rows for a page size of five, an
 * empty `nextLink`), so the table is not paged by the control at all — it is
 * the fallback that reads every row once. And `RetrieveRecordChangeHistory`
 * carries an `AuditRecord` on every detail (P13/P14) and pages by
 * `PagingInfo` (P15), so it is the route: one request per page.
 */

export const PAGE_MIN = 1;
export const PAGE_MAX = 100;
export const PAGE_DEFAULT = 20;

/** How many pages the column filter may load on its own looking for a match. */
export const MAX_AUTO_PAGES = 5;

const LOGICAL_NAME = /^[a-z][a-z0-9_]*$/;

export function isLogicalName(value: string): boolean {
    return LOGICAL_NAME.test(value);
}

export function clampPageSize(value: unknown): number {
    // Blank is the default; anything numeric is clamped, so a maker's 0 is 1.
    if (value === null || value === undefined || value === '') {
        return PAGE_DEFAULT;
    }

    const n = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(n)) {
        return PAGE_DEFAULT;
    }

    return Math.min(PAGE_MAX, Math.max(PAGE_MIN, Math.floor(n)));
}

export const AUDIT_SELECT = 'auditid,createdon,action,operation,_userid_value';

/** The audit rows for one record, newest first — the whole history, since the table does not page. */
export function auditsQuery(recordId: string): string {
    return `?$select=${AUDIT_SELECT}&$filter=_objectid_value eq ${recordId}&$orderby=createdon desc`;
}

/** The function bound to one audit row. */
export function detailsPath(auditId: string): string {
    return `audits(${auditId})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`;
}

export const ORGANIZATION_QUERY = '?$select=isauditenabled&$top=1';

export function tableDefinitionPath(table: string): string {
    return `EntityDefinitions(LogicalName='${encodeURIComponent(table)}')?$select=IsAuditEnabled,EntitySetName`;
}

/**
 * Every column's `IsValidForUpdate`, in one fetch per table (238 rows in
 * 87 ms on account, R6). It is the only source: `getEntityMetadata`'s items
 * do not carry it (R6), and the server does not refuse a write to a column
 * that cannot be updated — it resolves and changes nothing (R9) — so this
 * read is what keeps a Restore from succeeding at nothing.
 */
export function attributesPath(table: string): string {
    return `EntityDefinitions(LogicalName='${encodeURIComponent(table)}')/Attributes?$select=LogicalName,AttributeType,IsValidForUpdate`;
}

export interface PagingInfo {
    pageNumber: number;
    count: number;
    /** The cookie the previous page returned; page 2 by number alone also works (P15), the cookie is what Learn asks for. */
    cookie?: string;
}

function pagingAlias(paging: PagingInfo): string {
    const info: Record<string, unknown> = { PageNumber: paging.pageNumber, Count: paging.count, ReturnTotalRecordCount: true };

    if (paging.cookie) {
        info.PagingCookie = paging.cookie;
    }

    return encodeURIComponent(JSON.stringify(info));
}

function targetAlias(entitySet: string, recordId: string): string {
    return encodeURIComponent(`{'@odata.id':'${entitySet}(${recordId})'}`);
}

/**
 * The unbound function that answers a page of the record's history — who,
 * when and action on each detail's `AuditRecord`, old and new beside them.
 * `entitySet` is the price of the unbound shape: an entity reference is
 * `{'@odata.id':'<set>(<id>)'}`.
 */
export function changeHistoryPath(entitySet: string, recordId: string, paging: PagingInfo): string {
    return `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${targetAlias(entitySet, recordId)}&@p=${pagingAlias(paging)}`;
}

/** The same, for one column — the server-side *Only this column*. The column is a quoted string alias. */
export function attributeHistoryPath(entitySet: string, recordId: string, column: string, paging: PagingInfo): string {
    return `RetrieveAttributeChangeHistory(Target=@t,AttributeLogicalName=@a,PagingInfo=@p)`
        + `?@t=${targetAlias(entitySet, recordId)}&@a=${encodeURIComponent(`'${column}'`)}&@p=${pagingAlias(paging)}`;
}
