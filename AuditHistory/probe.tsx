/**
 * **TEMPORARY. Delete this file and the import in `index.ts` before 0.1.0 is
 * built.** It ships no behaviour. It exists to answer the questions under
 * *Measured — the 0.0.1 probe* in `SPEC.md` that only a real form can — what
 * the `audit` table answers through `context.webAPI`, what the two audit
 * *functions* answer through a same-origin `fetch`, what the old and new
 * values look like for a lookup, a cleared column and a choice, whether the
 * PCF Web API follows its own `nextLink`, and what a type-group binding looks
 * like from inside a field control.
 *
 * Every answer is printed into the control itself, so the person on the form
 * needs no developer tools, and mirrored to the console under one tag. The
 * context is read through a getter on every pass, never parked (the dead-
 * snapshot lesson from Data Table 0.5.0). Nothing here navigates or writes.
 *
 * Before opening the form, make these changes to the account and save, so the
 * history has something to say: set or change **Parent Account** (a lookup),
 * clear **Website** (a text column), change **Industry** (a choice), and paste
 * more than 5,000 characters into **Description** (the cap).
 */

import * as React from 'react';
import { IInputs } from './generated/ManifestTypes';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAG = '[audit-history probe 0.0.2]';

export interface ProbeProps {
    context: () => ComponentFramework.Context<IInputs>;
    /** updateView passes so far, counted by the class. */
    passes: number;
}

type Log = (line: string) => void;

const short = (value: unknown, max = 900): string => {
    let text: string;
    try {
        text = JSON.stringify(value, (_k, v) => (typeof v === 'function' ? '[function]' : v), 1) ?? String(value);
    } catch {
        text = String(value);
    }
    return text.length > max ? `${text.slice(0, max)}… (${text.length} chars)` : text;
};

const fault = (e: unknown): string => {
    const o = e as any;
    return short({
        ctor: o?.constructor?.name,
        errorCode: o?.errorCode,
        code: o?.code,
        message: o?.message,
        title: o?.title,
        keys: o && typeof o === 'object' ? Object.keys(o) : undefined,
    });
};

const bare = (id: string): string => id.replace(/[{}]/g, '').toLowerCase();

const ms = (t0: number): number => Math.round(performance.now() - t0);

const HEADERS = { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const ANNOTATED = { ...HEADERS, Prefer: 'odata.include-annotations="*"' };

/** One fetch, reported as status + elapsed + parsed body (or the raw text when it is not JSON). */
async function get(url: string, headers: Record<string, string>): Promise<{ status: number; ms: number; body: any; text?: string }> {
    const t0 = performance.now();
    const res = await fetch(url, { headers, credentials: 'same-origin' });
    const elapsed = ms(t0);
    const text = await res.text();
    try {
        return { status: res.status, ms: elapsed, body: JSON.parse(text) };
    } catch {
        return { status: res.status, ms: elapsed, body: null, text: text.slice(0, 300) };
    }
}

/** The keys of an OldValue/NewValue bag with their annotation suffixes, so the shape is visible. */
const bagKeys = (bag: any): string[] => (bag && typeof bag === 'object' ? Object.keys(bag) : []);

/** The columns a detail touches, ignoring annotations and @odata.type — for the P9 order comparison. */
const touched = (detail: any): string[] => {
    const keys = new Set<string>();
    for (const bag of [detail?.OldValue, detail?.NewValue]) {
        for (const key of bagKeys(bag)) {
            if (key.startsWith('@') || key.includes('@')) {
                continue;
            }
            keys.add(key.replace(/^_(.+)_value$/, '$1'));
        }
    }
    return [...keys].sort();
};

async function run(ctx: () => ComponentFramework.Context<IInputs>, log: Log): Promise<void> {
    const c = ctx() as any;
    const parameter = c.parameters?.value;

    // ---- P1: the type-group binding and the record's identity ---------------
    log(`P1 parameters.value keys: ${short(parameter ? Object.keys(parameter) : 'ABSENT')}`);
    log(`P1 type=${short(parameter?.type)} raw=${short(parameter?.raw, 120)} security=${short(parameter?.security)} error=${short(parameter?.error)} formatted=${short(parameter?.formatted, 120)}`);
    const attributes = parameter?.attributes;
    log(`P1 attributes keys: ${short(attributes ? Object.keys(attributes) : attributes)}`);
    log(`P1 attributes.LogicalName=${short(attributes?.LogicalName)} DisplayName=${short(attributes?.DisplayName)} Type=${short(attributes?.Type)}`);
    const info = c.mode?.contextInfo;
    log(`P1 mode.contextInfo = ${short(info)}; mode keys: ${short(Object.keys(c.mode ?? {}))}`);
    log(`P1 inputs: columnScope=${short(c.parameters?.columnScope?.raw)} pageSize=${short(c.parameters?.pageSize?.raw)} recordId=${short(c.parameters?.recordId?.raw)} recordEntity=${short(c.parameters?.recordEntity?.raw)} sampleData=${short(c.parameters?.sampleData?.raw, 60)}`);

    const recordId = info?.entityId ? bare(String(info.entityId)) : '';
    const table: string = info?.entityTypeName ?? 'account';
    const column: string = attributes?.LogicalName ?? 'name';
    if (!recordId) {
        log('P1 no entityId — the rest needs a saved record. Save, then reload the form.');
        return;
    }

    const clientUrl: string | undefined =
        (typeof c.page?.getClientUrl === 'function' ? c.page.getClientUrl() : undefined) ??
        (globalThis as any).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();
    log(`P1 clientUrl from page=${short(typeof c.page?.getClientUrl === 'function' ? c.page.getClientUrl() : '(no page.getClientUrl)')} resolved=${short(clientUrl)}`);
    const api = clientUrl ? `${clientUrl.replace(/\/$/, '')}/api/data/v9.2` : '';

    // ---- P8: is auditing on, and the entity set name --------------------------
    const webAPI = c.webAPI;
    const hasQuery = webAPI && typeof webAPI.retrieveMultipleRecords === 'function';
    let entitySet = `${table}s`;
    if (hasQuery) {
        try {
            const t0 = performance.now();
            const r = await webAPI.retrieveMultipleRecords('organization', '?$select=isauditenabled,isuseraccessauditenabled,auditretentionperiodv2&$top=1');
            log(`P8 organization in ${ms(t0)} ms: ${short(r.entities?.[0])}`);
        } catch (e) {
            log(`P8 organization REFUSED ${fault(e)}`);
        }
    } else {
        log(`P8 webAPI = ${short(webAPI ? Object.keys(webAPI) : webAPI)} — no retrieveMultipleRecords`);
    }
    if (api) {
        try {
            const r = await get(`${api}/EntityDefinitions(LogicalName='${table}')?$select=IsAuditEnabled,EntitySetName,PrimaryNameAttribute`, HEADERS);
            log(`P8 EntityDefinitions ${r.status} in ${r.ms} ms: ${short(r.body ?? r.text)}`);
            entitySet = r.body?.EntitySetName ?? entitySet;
        } catch (e) {
            log(`P8 EntityDefinitions THREW ${fault(e)}`);
        }
        try {
            const r = await get(`${api}/EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')?$select=IsAuditEnabled,LogicalName`, HEADERS);
            log(`P8b column ${column} IsAuditEnabled ${r.status}: ${short(r.body ?? r.text)}`);
        } catch (e) {
            log(`P8b column attribute THREW ${fault(e)}`);
        }
    }

    // ---- P11: display names through Utility -------------------------------------
    try {
        if (typeof c.utils?.getEntityMetadata === 'function') {
            const t0 = performance.now();
            const md = await c.utils.getEntityMetadata(table, [column, 'parentaccountid', 'industrycode', 'websiteurl', 'description']);
            const attrs = md?.Attributes;
            const one = typeof attrs?.get === 'function' ? attrs.get('industrycode') : attrs?.industrycode;
            log(`P11 getEntityMetadata in ${ms(t0)} ms: Attributes ctor=${short(attrs?.constructor?.name)} get=${typeof attrs?.get} getAll=${typeof attrs?.getAll}`);
            log(`P11 industrycode: keys=${short(one ? Object.keys(one) : one)} DisplayName=${short(one?.DisplayName)} LogicalName=${short(one?.LogicalName)} AttributeType=${short(one?.AttributeType)} AttributeTypeName=${short(one?.AttributeTypeName)}`);
            const all = typeof attrs?.getAll === 'function' ? attrs.getAll() : [];
            log(`P11 getAll(): ${all.length} → ${short(all.map((a: any) => [a?.LogicalName, a?.DisplayName]))}`);
        } else {
            log('P11 utils.getEntityMetadata ABSENT');
        }
    } catch (e) {
        log(`P11 getEntityMetadata THREW ${fault(e)}`);
    }

    if (!hasQuery) {
        return;
    }

    // ---- P2: the audit rows through context.webAPI ---------------------------------
    const select = '$select=auditid,createdon,action,operation,_userid_value,_objectid_value,objecttypecode,transactionid,attributemask';
    const query = `?${select}&$filter=_objectid_value eq ${recordId}&$orderby=createdon desc`;
    let rows: any[] = [];
    let nextLink = '';
    try {
        const t0 = performance.now();
        const r = await webAPI.retrieveMultipleRecords('audit', query, 5);
        rows = r.entities ?? [];
        nextLink = (r as any).nextLink ?? '';
        log(`P2 audit query OK in ${ms(t0)} ms: ${rows.length} rows; result keys=${short(Object.keys(r))}; nextLink=${short(nextLink, 300)}`);
        log(`P2 first row: ${short(rows[0])}`);
        log(`P2 actions on the page: ${short(rows.map((row) => [row.action, row['action@OData.Community.Display.V1.FormattedValue'], row.operation]))}`);
    } catch (e) {
        log(`P2 audit query REFUSED ${fault(e)}`);
    }

    // ---- P3: paging — nextLink back as options, then keyset ------------------------
    if (nextLink) {
        for (const [label, options] of [['full nextLink', nextLink], ['query part of nextLink', nextLink.slice(nextLink.indexOf('?'))]] as const) {
            try {
                const t0 = performance.now();
                const r = await webAPI.retrieveMultipleRecords('audit', options, 5);
                const ids = (r.entities ?? []).map((row: any) => row.auditid);
                const overlap = ids.filter((id: string) => rows.some((row) => row.auditid === id)).length;
                log(`P3 ${label}: OK in ${ms(t0)} ms, ${ids.length} rows, ${overlap} overlap with page 1, nextLink=${(r as any).nextLink ? 'yes' : 'no'}`);
            } catch (e) {
                log(`P3 ${label} REFUSED ${fault(e)}`);
            }
        }
    } else {
        log('P3 no nextLink on page 1 — fewer than 6 audit rows; make more changes to measure paging.');
    }
    if (rows.length) {
        const last = rows[rows.length - 1].createdon;
        try {
            const r = await webAPI.retrieveMultipleRecords('audit', `?${select}&$filter=_objectid_value eq ${recordId} and createdon lt ${last}&$orderby=createdon desc`, 5);
            log(`P3 keyset createdon lt ${last}: OK, ${r.entities?.length} rows`);
        } catch (e) {
            log(`P3 keyset REFUSED ${fault(e)}`);
        }
    }

    if (!api) {
        log('no client URL — P4–P7, P9, P10 need one');
        return;
    }

    // ---- P4 / P5 / P6 / P12: RetrieveAuditDetails, once, then a whole page in parallel
    const details = new Map<string, any>();
    if (rows.length) {
        const first = rows[0].auditid;
        try {
            const plain = await get(`${api}/audits(${first})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, HEADERS);
            log(`P4 RetrieveAuditDetails (no Prefer) ${plain.status} in ${plain.ms} ms: keys=${short(Object.keys(plain.body ?? {}))} detail keys=${short(Object.keys(plain.body?.AuditDetail ?? {}))} NewValue keys=${short(bagKeys(plain.body?.AuditDetail?.NewValue))}`);
            const annotated = await get(`${api}/audits(${first})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, ANNOTATED);
            log(`P4 RetrieveAuditDetails (Prefer annotations) ${annotated.status} in ${annotated.ms} ms: NewValue keys=${short(bagKeys(annotated.body?.AuditDetail?.NewValue))}`);
            log(`P13 AuditRecord (no Prefer) = ${short(plain.body?.AuditDetail?.AuditRecord, 1200)}`);
            log(`P13 AuditRecord (Prefer) = ${short(annotated.body?.AuditDetail?.AuditRecord, 1500)}`);
        } catch (e) {
            log(`P4 RetrieveAuditDetails THREW ${fault(e)}`);
        }
    }
    try {
        const t0 = performance.now();
        const page = await webAPI.retrieveMultipleRecords('audit', query, 20);
        const ids: string[] = (page.entities ?? []).map((row: any) => row.auditid);
        const t1 = performance.now();
        const results = await Promise.all(ids.map((id) => get(`${api}/audits(${id})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, ANNOTATED).catch((e) => ({ status: -1, ms: 0, body: null, text: fault(e) }))));
        const statuses = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
        log(`P4 page of ${ids.length} fetched in ${ms(t0)} ms; ${ids.length} details in parallel in ${ms(t1)} ms; statuses=${short(statuses)}; slowest=${Math.max(0, ...results.map((r) => r.ms))} ms`);
        results.forEach((r, i) => {
            if (r.body?.AuditDetail) {
                details.set(ids[i], r.body.AuditDetail);
            }
        });
        // P5 / P6: the shapes, per action, for the first eight
        (page.entities ?? []).slice(0, 8).forEach((row: any, i: number) => {
            const d = details.get(row.auditid);
            log(`P5/P6 #${i} action=${row.action} (${row['action@OData.Community.Display.V1.FormattedValue']}) type=${short(d?.['@odata.type'])} keys=${short(d ? Object.keys(d) : d)}`);
            log(`     OldValue=${short(d?.OldValue, 700)}`);
            log(`     NewValue=${short(d?.NewValue, 700)}`);
            log(`     DeletedAttributes=${short(d?.DeletedAttributes)} InvalidNewValueAttributes=${short(d?.InvalidNewValueAttributes)}`);
        });
        // P12: the cap
        for (const [id, d] of details) {
            for (const bag of [d?.OldValue, d?.NewValue]) {
                for (const key of bagKeys(bag)) {
                    const v = bag[key];
                    if (typeof v === 'string' && v.length > 1000) {
                        log(`P12 ${id} ${key}: ${v.length} chars, ends with "${v.slice(-12)}" — trailing ellipsis? ${v.endsWith('…') || v.endsWith('...')}`);
                    }
                }
            }
        }
    } catch (e) {
        log(`P4 page THREW ${fault(e)}`);
    }

    // ---- P7: a bogus id, and (for the record) the summary query as a bare fetch ----
    try {
        const r = await get(`${api}/audits(00000000-0000-0000-0000-000000000001)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, HEADERS);
        log(`P7 bogus id ${r.status}: ${short(r.body ?? r.text, 400)}`);
    } catch (e) {
        log(`P7 bogus id THREW ${fault(e)}`);
    }
    log('P7 the privilege refusal needs a user without prvReadAuditSummary — run this build under that role, or record it as Not verified.');

    // ---- P9: RetrieveRecordChangeHistory, unbound, with @-aliases --------------------
    try {
        const target = encodeURIComponent(`{'@odata.id':'${entitySet}(${recordId})'}`);
        const paging = encodeURIComponent(JSON.stringify({ PageNumber: 1, Count: 5, ReturnTotalRecordCount: true }));
        const r = await get(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`, ANNOTATED);
        const coll = r.body?.AuditDetailCollection;
        const list: any[] = coll?.AuditDetails ?? [];
        log(`P9 RetrieveRecordChangeHistory ${r.status} in ${r.ms} ms: keys=${short(Object.keys(r.body ?? {}))} MoreRecords=${short(coll?.MoreRecords)} TotalRecordCount=${short(coll?.TotalRecordCount)} AuditDetails=${list.length} cookie=${String(coll?.PagingCookie ?? '').length} chars`);
        log(`P9 first detail keys=${short(list[0] ? Object.keys(list[0]) : list[0])} — AuditRecord present? ${list.some((d) => 'AuditRecord' in d)}`);
        list.forEach((d, i) => log(`P14 #${i} touched=${short(touched(d))} AuditRecord=${short(d.AuditRecord, 900)}`));
        try {
            const p2 = encodeURIComponent(JSON.stringify({ PageNumber: 2, Count: 2, ReturnTotalRecordCount: true }));
            const second = await get(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${p2}`, ANNOTATED);
            const c2 = second.body?.AuditDetailCollection;
            log(`P15 page 2 of 2 by PageNumber alone: ${second.status} MoreRecords=${short(c2?.MoreRecords)} Total=${short(c2?.TotalRecordCount)} n=${c2?.AuditDetails?.length} ids=${short((c2?.AuditDetails ?? []).map((d: any) => d.AuditRecord?.auditid))}`);
            const p1 = encodeURIComponent(JSON.stringify({ PageNumber: 1, Count: 2, ReturnTotalRecordCount: true }));
            const firstPage = await get(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${p1}`, ANNOTATED);
            const c1 = firstPage.body?.AuditDetailCollection;
            log(`P15 page 1 of 2: MoreRecords=${short(c1?.MoreRecords)} cookie=${String(c1?.PagingCookie ?? '').length} chars ids=${short((c1?.AuditDetails ?? []).map((d: any) => d.AuditRecord?.auditid))}`);
            if (c1?.PagingCookie) {
                const p2c = encodeURIComponent(JSON.stringify({ PageNumber: 2, Count: 2, ReturnTotalRecordCount: true, PagingCookie: c1.PagingCookie }));
                const withCookie = await get(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${p2c}`, ANNOTATED);
                const cc = withCookie.body?.AuditDetailCollection;
                log(`P15 page 2 with the cookie: ${withCookie.status} n=${cc?.AuditDetails?.length} ids=${short((cc?.AuditDetails ?? []).map((d: any) => d.AuditRecord?.auditid))}`);
            }
        } catch (e) {
            log(`P15 paging THREW ${fault(e)}`);
        }
        const byFunction = list.map(touched);
        const byRows = rows.slice(0, 5).map((row) => touched(details.get(row.auditid)));
        log(`P9 order vs the audits query: function=${short(byFunction)} rows=${short(byRows)} same=${JSON.stringify(byFunction) === JSON.stringify(byRows)}`);
        if (r.status !== 200) {
            log(`P9 body: ${short(r.body ?? r.text, 500)}`);
        }
    } catch (e) {
        log(`P9 RetrieveRecordChangeHistory THREW ${fault(e)}`);
    }

    // ---- P10: RetrieveAttributeChangeHistory for the bound column ----------------------
    try {
        const target = encodeURIComponent(`{'@odata.id':'${entitySet}(${recordId})'}`);
        const paging = encodeURIComponent(JSON.stringify({ PageNumber: 1, Count: 5, ReturnTotalRecordCount: true }));
        const r = await get(`${api}/RetrieveAttributeChangeHistory(Target=@t,AttributeLogicalName=@a,PagingInfo=@p)?@t=${target}&@a=${encodeURIComponent(`'${column}'`)}&@p=${paging}`, ANNOTATED);
        const coll = r.body?.AuditDetailCollection;
        log(`P10 RetrieveAttributeChangeHistory(${column}) ${r.status} in ${r.ms} ms: TotalRecordCount=${short(coll?.TotalRecordCount)} AuditDetails=${coll?.AuditDetails?.length} MoreRecords=${short(coll?.MoreRecords)}`);
        (coll?.AuditDetails ?? []).forEach((d: any, i: number) => log(`P10 #${i} touched=${short(touched(d))} when=${short(d.AuditRecord?.createdon)} action=${short(d.AuditRecord?.action)} old=${short(d.OldValue, 300)} new=${short(d.NewValue, 300)}`));
        if (r.status !== 200) {
            log(`P10 body: ${short(r.body ?? r.text, 500)}`);
        }
    } catch (e) {
        log(`P10 RetrieveAttributeChangeHistory THREW ${fault(e)}`);
    }

    log('done.');
}

export const Probe: React.FC<ProbeProps> = (props) => {
    const [lines, setLines] = React.useState<string[]>([]);
    const [runs, setRuns] = React.useState(0);
    const log = React.useCallback((line: string) => {
        console.log(TAG, line);
        setLines((prev) => [...prev, line]);
    }, []);

    React.useEffect(() => {
        setLines([]);
        log(`probe start (run ${runs + 1})`);
        run(props.context, log).catch((e) => log(`probe THREW ${fault(e)}`));
        // Runs once per press of the button; the context getter always reads the latest.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs]);

    return React.createElement(
        'div',
        { style: { fontFamily: 'Consolas, monospace', fontSize: 12, padding: 8 } },
        React.createElement('div', null, `${TAG} updateView passes: ${props.passes}`),
        React.createElement('button', { type: 'button', onClick: () => setRuns((n) => n + 1), style: { margin: '6px 0' } }, 'Run the probe again'),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 } }, lines.join('\n')),
    );
};
