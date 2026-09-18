/**
 * The exact strings sent to the platform, in one place, so a spelling is
 * decided once and asserted once. Nothing here talks to a host.
 */

export const PAGE_MIN = 1;
export const PAGE_MAX = 100;
export const PAGE_DEFAULT = 20;

/**
 * How page two is asked for. `nextLink` is the platform's own continuation
 * handed back as `options`; `keyset` is a `createdon lt <last>` filter, the
 * fallback if SPEC.md P3 finds the PCF Web API does not follow its link.
 */
export const PAGING: 'nextLink' | 'keyset' = 'nextLink';

/**
 * Whether the loaded page's details are fetched as soon as the rows arrive,
 * in parallel, or one at a time when a row is opened. Eager is what the
 * column filter needs; P4 measures whether a page of twenty is quick enough.
 */
export const DETAIL_MODE: 'eager' | 'lazy' = 'eager';

/** How many pages the column scope may load on its own looking for a match. */
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

/** The audit rows for one record, newest first. */
export function auditsQuery(recordId: string, before?: string): string {
    const window = before ? ` and createdon lt ${before}` : '';

    return `?$select=${AUDIT_SELECT}&$filter=_objectid_value eq ${recordId}${window}&$orderby=createdon desc`;
}

/** The function bound to one audit row. */
export function detailsPath(auditId: string): string {
    return `audits(${auditId})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`;
}

export const ORGANIZATION_QUERY = '?$select=isauditenabled&$top=1';

export function tableDefinitionPath(table: string): string {
    return `EntityDefinitions(LogicalName='${encodeURIComponent(table)}')?$select=IsAuditEnabled`;
}

/**
 * The unbound function, for the source that reads a whole page of values in
 * one call (`createChangeHistorySource`). `entitySet` is the price of the
 * unbound shape: an entity reference is `{'@odata.id':'<set>(<id>)'}`.
 */
export function changeHistoryPath(entitySet: string, recordId: string, pageNumber: number, count: number): string {
    const target = encodeURIComponent(`{'@odata.id':'${entitySet}(${recordId})'}`);
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: pageNumber, Count: count, ReturnTotalRecordCount: true }));

    return `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`;
}
