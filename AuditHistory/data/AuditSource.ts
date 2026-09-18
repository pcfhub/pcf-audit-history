/**
 * Where the history comes from: one interface, two sources built and one
 * stubbed. The component asks `loadPage()` per page and `loadDetail(id)` per
 * row, and never knows which route answered — so the routes can be swapped
 * by the suite and by the hub's demo without a branch in the rendering.
 *
 * The live source is **rows from the `audit` table, values per row from
 * `RetrieveAuditDetails`**, correlated by `auditid`. The reason is in
 * SPEC.md, *Where the rows come from*: the Web API's `AuditDetail` carries
 * no `AuditRecord`, so no function alone can say who changed what when.
 */

import { AuditPage, Cursor, Detail, SourceFault } from '../audit/types';
import { toRows } from '../audit/rows';
import { diffDetail } from '../audit/diff';
import { auditsQuery, PAGING } from '../audit/query';
import { AuditWebApi, FetchAnswer, orgAuditEnabled, retrieveAuditDetails, tableAuditEnabled } from '../platform';
import { SampleHistory } from '../sample/parseSampleData';

export type Route = 'audits' | 'sample';

export interface Enabled {
    org: boolean | null;
    table: boolean | null;
}

export interface AuditSource {
    route: Route;
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
 * privilege; SPEC.md P7 records what the form sent, and this reads both.
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
function answerFault(answer: FetchAnswer): SourceFault {
    const message = typeof answer.body?.error?.message === 'string' ? answer.body.error.message : `HTTP ${answer.status}`;

    return { message, privilege: answer.status === 401 || answer.status === 403 || isPrivilegeFault(answer.body?.error) };
}

export interface LiveOptions {
    webAPI: AuditWebApi;
    /** `null` when the host has no organisation URL — rows only, no values. */
    clientUrl: string | null;
    recordId: string;
    table: string;
    pageSize: number;
}

/** The live route: `retrieveMultipleRecords('audit', …)` paged, `RetrieveAuditDetails` per row. */
export function createAuditsSource(o: LiveOptions): AuditSource {
    return {
        route: 'audits',
        loadPage: (cursor) => {
            const options = cursor === null
                ? auditsQuery(o.recordId)
                : cursor.kind === 'nextLink' ? cursor.url : auditsQuery(o.recordId, cursor.before);

            return o.webAPI.retrieveMultipleRecords('audit', options, o.pageSize).then(
                (result) => {
                    const rows = toRows(result.entities ?? []);
                    const last = rows[rows.length - 1];
                    let next: Cursor | null = null;

                    if (PAGING === 'nextLink' && typeof result.nextLink === 'string' && result.nextLink !== '') {
                        next = { kind: 'nextLink', url: result.nextLink };
                    } else if (PAGING === 'keyset' && rows.length === o.pageSize && last) {
                        next = { kind: 'keyset', before: last.when };
                    }

                    return { rows, next, total: null };
                },
                (error) => Promise.reject(toFault(error)),
            );
        },
        loadDetail: (id) => {
            if (o.clientUrl === null) {
                return Promise.reject<Detail>({ message: 'No organisation URL.', privilege: false } as SourceFault);
            }

            return retrieveAuditDetails(o.clientUrl, id).then(
                (answer) => (answer.ok ? diffDetail(answer.body) : Promise.reject(answerFault(answer))),
                (error) => Promise.reject({ message: faultMessage(error), privilege: false } as SourceFault),
            );
        },
        probeEnabled: () =>
            Promise.all([
                orgAuditEnabled(o.webAPI),
                o.clientUrl === null ? Promise.resolve<boolean | null>(null) : tableAuditEnabled(o.clientUrl, o.table),
            ]).then(([org, table]) => ({ org, table })),
    };
}

/** The demo route: the parsed `sampleData`, paged the way the live one is so *Load more* has something to do. */
export function createSampleSource(sample: SampleHistory, pageSize: number): AuditSource {
    return {
        route: 'sample',
        loadPage: (cursor) => {
            const offset = cursor?.kind === 'keyset' ? Number(cursor.before) : 0;
            const rows = sample.rows.slice(offset, offset + pageSize);
            const more = offset + pageSize < sample.rows.length;

            return Promise.resolve({
                rows,
                next: more ? { kind: 'keyset', before: String(offset + pageSize) } : null,
                total: sample.rows.length,
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
