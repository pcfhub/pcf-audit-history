/**
 * Where the history comes from: one interface, three sources. The component
 * asks `loadPage()` per page and `loadDetail(id)` per row without values,
 * and never knows which route answered — so the routes can be swapped by
 * the suite and by the hub's demo without a branch in the rendering.
 *
 * **The live route is one request per page**: `RetrieveRecordChangeHistory`
 * (or `RetrieveAttributeChangeHistory`, for *Only this column*) hands back a
 * page of `AuditDetail`s each carrying its `AuditRecord` — who, when, action
 * — beside its old and new values, with `TotalRecordCount` and `MoreRecords`.
 * Learn says the Web API omits `AuditRecord`; measured on the Accounts form
 * (SPEC.md P13–P15), it does not. The `audit` table is the **fallback**, for
 * a user who may read the rows but not the history (`prvReadAuditSummary`
 * without `prvReadRecordAuditHistory`): it answers every row at once — the
 * table ignores `maxPageSize` (P2/P3) — and the control pages what it holds.
 */

import { AuditPage, Cursor, Detail, SourceFault } from '../audit/types';
import { toRow, toRows } from '../audit/rows';
import { diffDetail } from '../audit/diff';
import { attributeHistoryPath, auditsQuery, changeHistoryPath } from '../audit/query';
import { AuditWebApi, FetchAnswer, orgAuditEnabled, retrieveAuditDetails, retrieveHistory, tableAuditEnabled } from '../platform';
import { SampleHistory } from '../sample/parseSampleData';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Route = 'history' | 'audits' | 'sample';

export interface Enabled {
    org: boolean | null;
    table: boolean | null;
}

export interface AuditSource {
    /** Which route answered the last page — the fallback switches it. */
    readonly route: Route;
    loadPage(cursor: Cursor | null): Promise<AuditPage>;
    loadDetail(id: string): Promise<Detail>;
    probeEnabled(): Promise<Enabled>;
}

/**
 * The one readable sentence in a Web API rejection. The platform rejects
 * with a plain object whose `message` is the server's explanation; anything
 * else is rendered as text rather than as `[object Object]`.
 */
export function faultMessage(error: unknown): string {
    if (error === null || error === undefined) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    const message = (error as { message?: unknown }).message;

    return typeof message === 'string' ? message : String(error);
}

/**
 * Whether a rejection is the user lacking a privilege. The Web API's
 * `errorCode` for it is `0x80040220` (2147746336) and its message names the
 * privilege; the platform's generic refusal is 2147746323. Not measured on
 * this control (SPEC.md P7 needs a second user), so the message is read too.
 */
export function isPrivilegeFault(error: unknown): boolean {
    const code = (error as { errorCode?: unknown })?.errorCode;
    const message = faultMessage(error);

    return code === 2147746336 || code === 2147746323 || /privilege|permission|prv[A-Z]/i.test(message);
}

export function toFault(error: unknown): SourceFault {
    return { message: faultMessage(error), privilege: isPrivilegeFault(error) };
}

/** A non-2xx function answer as a fault: 401/403 are the privilege shape. */
export function answerFault(answer: FetchAnswer): SourceFault {
    const message = typeof answer.body?.error?.message === 'string' ? answer.body.error.message : `HTTP ${answer.status}`;

    return { message, privilege: answer.status === 401 || answer.status === 403 || isPrivilegeFault(answer.body?.error) };
}

export interface LiveOptions {
    /** `null` on a host without the feature — then only the functions can answer. */
    webAPI: AuditWebApi | null;
    /** `null` when the host has no organisation URL — then only the table can answer, rows without values. */
    clientUrl: string | null;
    /** `null` when neither metadata route named it — then the unbound functions cannot be addressed. */
    entitySet: string | null;
    recordId: string;
    table: string;
    pageSize: number;
    /** The bound column when *Only this column* is on — the attribute-history function instead of the record's. */
    column: string | null;
}

/** A page of `AuditDetail`s with their `AuditRecord`s, reduced to rows and values. */
export function readHistoryPage(body: any, pageNumber: number): AuditPage {
    const collection = body?.AuditDetailCollection ?? {};
    const list: any[] = Array.isArray(collection.AuditDetails) ? collection.AuditDetails : [];
    const rows = [];
    const details: Record<string, Detail> = {};

    for (const item of list) {
        const row = toRow(item?.AuditRecord ?? {});

        if (row === null) {
            continue;
        }

        rows.push(row);
        details[row.id] = diffDetail(item);
    }

    const more = collection.MoreRecords === true;
    const cookie = typeof collection.PagingCookie === 'string' && collection.PagingCookie !== '' ? collection.PagingCookie : undefined;
    const total = typeof collection.TotalRecordCount === 'number' && collection.TotalRecordCount >= 0 ? collection.TotalRecordCount : null;

    return {
        rows,
        details,
        next: more ? { kind: 'page', pageNumber: pageNumber + 1, cookie } : null,
        total,
    };
}

/** The record-history route: one function call per page. */
export function createHistorySource(o: LiveOptions & { clientUrl: string; entitySet: string }): AuditSource {
    return {
        route: 'history',
        loadPage: (cursor) => {
            const pageNumber = cursor?.kind === 'page' ? cursor.pageNumber : 1;
            const paging = { pageNumber, count: o.pageSize, cookie: cursor?.kind === 'page' ? cursor.cookie : undefined };
            const path = o.column
                ? attributeHistoryPath(o.entitySet, o.recordId, o.column, paging)
                : changeHistoryPath(o.entitySet, o.recordId, paging);

            return retrieveHistory(o.clientUrl, path).then(
                (answer) => (answer.ok ? readHistoryPage(answer.body, pageNumber) : Promise.reject(answerFault(answer))),
                (error) => Promise.reject({ message: faultMessage(error), privilege: false } as SourceFault),
            );
        },
        loadDetail: (id) =>
            retrieveAuditDetails(o.clientUrl, id).then(
                (answer) => (answer.ok ? diffDetail(answer.body) : Promise.reject(answerFault(answer))),
                (error) => Promise.reject({ message: faultMessage(error), privilege: false } as SourceFault),
            ),
        probeEnabled: () => probe(o),
    };
}

/**
 * The audit-table route: every row once through `context.webAPI` — the
 * table ignores `maxPageSize`, so the control slices — and values per row
 * through the bound function where there is an organisation URL to call.
 */
export function createAuditsSource(o: LiveOptions & { webAPI: AuditWebApi }): AuditSource {
    let all: Promise<AuditPage['rows']> | null = null;

    const rows = (): Promise<AuditPage['rows']> => {
        all = all ?? o.webAPI.retrieveMultipleRecords('audit', auditsQuery(o.recordId)).then(
            (result) => toRows(result.entities ?? []),
            (error) => {
                all = null;

                return Promise.reject(toFault(error));
            },
        );

        return all;
    };

    return {
        route: 'audits',
        loadPage: (cursor) =>
            rows().then((every) => {
                const offset = cursor?.kind === 'offset' ? cursor.offset : 0;
                const slice = every.slice(offset, offset + o.pageSize);
                const more = offset + o.pageSize < every.length;

                return { rows: slice, next: more ? { kind: 'offset', offset: offset + o.pageSize } : null, total: every.length };
            }),
        loadDetail: (id) => {
            if (o.clientUrl === null) {
                return Promise.reject<Detail>({ message: 'No organisation URL.', privilege: false } as SourceFault);
            }

            return retrieveAuditDetails(o.clientUrl, id).then(
                (answer) => (answer.ok ? diffDetail(answer.body) : Promise.reject(answerFault(answer))),
                (error) => Promise.reject({ message: faultMessage(error), privilege: false } as SourceFault),
            );
        },
        probeEnabled: () => probe(o),
    };
}

function probe(o: LiveOptions): Promise<Enabled> {
    return Promise.all([
        o.webAPI === null ? Promise.resolve<boolean | null>(null) : orgAuditEnabled(o.webAPI),
        o.clientUrl === null ? Promise.resolve<boolean | null>(null) : tableAuditEnabled(o.clientUrl, o.table),
    ]).then(([org, table]) => ({ org, table }));
}

/**
 * The live source: the record-history route when the host can address it,
 * falling back to the audit table **once, on the first page**, when the
 * function is refused for a privilege and the table can still be read —
 * which is the user with `prvReadAuditSummary` and not
 * `prvReadRecordAuditHistory`. Every later page follows the route the first
 * one settled on, so a list never mixes the two.
 */
export function createLiveSource(o: LiveOptions): AuditSource | null {
    const history = o.clientUrl !== null && o.entitySet !== null
        ? createHistorySource({ ...o, clientUrl: o.clientUrl, entitySet: o.entitySet })
        : null;
    const audits = o.webAPI !== null ? createAuditsSource({ ...o, webAPI: o.webAPI }) : null;

    if (history === null && audits === null) {
        return null;
    }

    let current: AuditSource = history ?? (audits as AuditSource);
    // The privilege the history route was refused for. The bound function
    // needs the same one, so every row's values are refused without asking.
    let refused: SourceFault | null = null;

    return {
        get route() {
            return current.route;
        },
        loadPage: (cursor) =>
            current.loadPage(cursor).catch((fault: SourceFault) => {
                if (cursor === null && current === history && audits !== null && fault.privilege) {
                    current = audits;
                    refused = fault;

                    return audits.loadPage(null);
                }

                return Promise.reject(fault);
            }),
        loadDetail: (id) => (refused ? Promise.reject(refused) : current.loadDetail(id)),
        probeEnabled: () => probe(o),
    };
}

/** The demo route: the parsed `sampleData`, paged the way the live one is so *Load more* has something to do. */
export function createSampleSource(sample: SampleHistory, pageSize: number, column: string | null = null): AuditSource {
    const rows = column === null
        ? sample.rows
        : sample.rows.filter((row) => {
            const detail = sample.details[row.id];

            return detail?.kind === 'attributes' && detail.changes.some((change) => change.column === column);
        });

    return {
        route: 'sample',
        loadPage: (cursor) => {
            const offset = cursor?.kind === 'offset' ? cursor.offset : 0;
            const slice = rows.slice(offset, offset + pageSize);
            const more = offset + pageSize < rows.length;
            const details: Record<string, Detail> = {};

            for (const row of slice) {
                if (sample.details[row.id]) {
                    details[row.id] = sample.details[row.id];
                }
            }

            return Promise.resolve({
                rows: slice,
                details,
                next: more ? { kind: 'offset', offset: offset + pageSize } : null,
                total: rows.length,
            });
        },
        loadDetail: (id) => {
            const detail = sample.details[id];

            return detail
                ? Promise.resolve(detail)
                : Promise.reject({ message: 'Not in the sample.', privilege: false } as SourceFault);
        },
        probeEnabled: () => Promise.resolve({ org: sample.auditing.org, table: sample.auditing.table }),
    };
}
