/**
 * **TEMPORARY. Delete this file and restore `index.ts` from `index.live.ts`
 * before 0.2.0 is built.** It ships no behaviour. It exists to answer the
 * questions under *0.2.0 — Restore, and the questions it rests on* in
 * `SPEC.md` that only a real form can: what the raw values on an
 * `AttributeAuditDetail` look like per column type, whether
 * `webAPI.updateRecord` takes each of them back, whether a lookup can be
 * cleared and set from the detail's own `associatednavigationproperty`
 * annotation, what the form does after a write went around it, what the
 * metadata says about a column that cannot be written, and what a refused
 * write looks like.
 *
 * The read half runs on mount (R1, R5, R6, R7). **Every write is behind a
 * button** and says so on the button; nothing writes on its own. Every
 * answer is printed into the control and mirrored to the console under one
 * tag. The context is read through a getter on every use, never parked.
 */

import * as React from 'react';
import { IInputs } from './generated/ManifestTypes';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TAG = '[audit-history probe 0.1.1]';

export interface ProbeProps {
    context: () => ComponentFramework.Context<IInputs>;
    passes: number;
}

type Log = (line: string) => void;

const F = '@OData.Community.Display.V1.FormattedValue';
const L = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const N = '@Microsoft.Dynamics.CRM.associatednavigationproperty';

const short = (value: unknown, max = 900): string => {
    let text: string;
    try {
        text = JSON.stringify(value, (_k, v) => (typeof v === 'function' ? '[function]' : v)) ?? String(value);
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
    }, 1400);
};

const bare = (id: string): string => id.replace(/[{}]/g, '').toLowerCase();
const ms = (t0: number): number => Math.round(performance.now() - t0);

const HEADERS = { Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };
const ANNOTATED = { ...HEADERS, Prefer: 'odata.include-annotations="*"' };

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

/** What the probe knows about the form once the read half has run. */
interface Site {
    c: any;
    table: string;
    recordId: string;
    entitySet: string;
    api: string;
    /** The newest Update detail with at least one primitive column, and its bags. */
    primitive: { auditid: string; oldBag: any; newBag: any; columns: string[] } | null;
    /** The newest detail that touched a lookup, with the annotation-derived pieces. */
    lookup: { column: string; nav: string; target: string; targetSet: string | null } | null;
}

const isAnnotation = (key: string): boolean => key.startsWith('@') || key.includes('@');
const columnOf = (key: string): string => key.split('@')[0].replace(/^_(.+)_value$/, '$1');

/** The primitive columns of a bag: no lookups, no `_base` shadows, no composites. */
function primitiveColumns(bag: any): string[] {
    return Object.keys(bag || {})
        .filter((key) => !isAnnotation(key) && !/^_.+_value$/.test(key) && !key.endsWith('_base') && !key.endsWith('_composite'));
}

async function readHalf(ctx: () => ComponentFramework.Context<IInputs>, log: Log): Promise<Site | null> {
    const c = ctx() as any;
    const parameter = c.parameters?.value;
    const info = c.mode?.contextInfo;
    const recordId = info?.entityId ? bare(String(info.entityId)) : '';
    const table: string = info?.entityTypeName ?? 'account';

    // ---- R5: the switches a read-only form throws -----------------------------
    log(`R5 mode.isControlDisabled=${short(c.mode?.isControlDisabled)} isVisible=${short(c.mode?.isVisible)} security=${short(parameter?.security)} mode keys=${short(Object.keys(c.mode ?? {}))}`);
    log(`R5 webAPI.updateRecord=${typeof c.webAPI?.updateRecord} navigation.openConfirmDialog=${typeof c.navigation?.openConfirmDialog} navigation.openForm=${typeof c.navigation?.openForm}`);

    // ---- R7: the privilege, at every depth ---------------------------------------
    if (typeof c.utils?.hasEntityPrivilege === 'function') {
        const depths = [0, 1, 2, 3].map((depth) => {
            try {
                return `${depth}:${short(c.utils.hasEntityPrivilege(table, 3, depth))}`;
            } catch (e) {
                return `${depth}:THREW ${fault(e)}`;
            }
        });
        log(`R7 hasEntityPrivilege(${table}, Write=3, depth) → ${depths.join(' ')}; Read=2 basic → ${short(c.utils.hasEntityPrivilege(table, 2, 0))}; Delete=4 basic → ${short(c.utils.hasEntityPrivilege(table, 4, 0))}`);
    } else {
        log(`R7 utils.hasEntityPrivilege ABSENT (utils keys: ${short(c.utils ? Object.keys(c.utils) : c.utils)})`);
    }

    if (!recordId) {
        log('no entityId — save the record, then reload the form.');
        return null;
    }

    const clientUrl: string | undefined =
        (typeof c.page?.getClientUrl === 'function' ? c.page.getClientUrl() : undefined) ??
        (globalThis as any).Xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();
    const api = clientUrl ? `${clientUrl.replace(/\/$/, '')}/api/data/v9.2` : '';

    if (!api) {
        log('no client URL — R1, R6 and R8 need one');
        return null;
    }

    // ---- entity set ----------------------------------------------------------
    let entitySet = `${table}s`;
    try {
        const md = await c.utils.getEntityMetadata(table);
        entitySet = md?.EntitySetName ?? entitySet;
    } catch (e) {
        log(`entity set via getEntityMetadata THREW ${fault(e)}`);
    }

    // ---- R1: the raw values, by column, across page 1 --------------------------
    const site: Site = { c, table, recordId, entitySet, api, primitive: null, lookup: null };
    const target = encodeURIComponent(`{'@odata.id':'${entitySet}(${recordId})'}`);
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: 1, Count: 20, ReturnTotalRecordCount: true }));
    const r = await get(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`, ANNOTATED);
    const list: any[] = r.body?.AuditDetailCollection?.AuditDetails ?? [];
    log(`R1 RetrieveRecordChangeHistory ${r.status} in ${r.ms} ms: ${list.length} details, Total=${short(r.body?.AuditDetailCollection?.TotalRecordCount)}`);

    const seen = new Map<string, string>();
    const touchedAll = new Set<string>();

    for (const d of list) {
        const action = d?.AuditRecord?.action;
        const type = String(d?.['@odata.type'] ?? '');
        if (!/AttributeAuditDetail$/.test(type)) {
            continue;
        }
        log(`R1 detail ${short(d.AuditRecord?.auditid)} action=${action} (${short(d.AuditRecord?.[`action${F}`])}) bag @odata.type old=${short(d.OldValue?.['@odata.type'])} new=${short(d.NewValue?.['@odata.type'])} DeletedAttributes=${short(d.DeletedAttributes)}`);
        for (const [side, bag] of [['old', d.OldValue], ['new', d.NewValue]] as const) {
            for (const key of Object.keys(bag || {})) {
                if (isAnnotation(key)) {
                    continue;
                }
                const column = columnOf(key);
                touchedAll.add(column);
                const raw = bag[key];
                const line = `${column}: ${side} raw=${short(raw, 80)} (${raw === null ? 'null' : typeof raw}) formatted=${short(bag[`${key}${F}`], 60)} lookup=${short(bag[`${key}${L}`])} nav=${short(bag[`${key}${N}`])}`;
                const tag = `${column}|${side}`;
                if (!seen.has(tag)) {
                    seen.set(tag, line);
                }
            }
        }
        if (action === 2) {
            if (site.primitive === null) {
                const columns = primitiveColumns(d.NewValue).filter((col) => !['statecode', 'statuscode'].includes(col));
                if (columns.length > 0) {
                    site.primitive = { auditid: d.AuditRecord?.auditid, oldBag: d.OldValue, newBag: d.NewValue, columns };
                }
            }
            if (site.lookup === null) {
                for (const bag of [d.NewValue, d.OldValue]) {
                    const key = Object.keys(bag || {}).find((k) => /^_.+_value$/.test(k) && typeof bag[`${k}${N}`] === 'string');
                    if (key && !['ownerid', 'parentcustomerid'].includes(columnOf(key))) {
                        site.lookup = { column: columnOf(key), nav: bag[`${key}${N}`], target: bag[`${key}${L}`], targetSet: null };
                        break;
                    }
                }
            }
        }
    }
    for (const line of seen.values()) {
        log(`R1 ${line}`);
    }
    log(`R1 primitive restore candidate: ${site.primitive ? `${site.primitive.auditid} columns=${short(site.primitive.columns)}` : 'NONE — make an Update with a primitive column'}`);
    log(`R1 lookup candidate: ${short(site.lookup) || 'NONE — set Parent Account first'}`);

    // ---- R6: what the metadata says about the touched columns --------------------
    const columns = [...touchedAll].filter((col) => !col.endsWith('_base'));
    try {
        const t0 = performance.now();
        const md = await c.utils.getEntityMetadata(table, columns);
        const attrs = md?.Attributes;
        const items: any[] = typeof attrs?.getAll === 'function' ? attrs.getAll() : [];
        log(`R6 getEntityMetadata(${table}, ${columns.length} cols) in ${ms(t0)} ms → ${items.length} items`);
        const one = items[0];
        if (one) {
            const proto = Object.getPrototypeOf(one);
            log(`R6 item own keys=${short(Object.keys(one))} proto getters=${short(proto ? Object.getOwnPropertyNames(proto) : [])}`);
        }
        for (const item of items) {
            log(`R6 ${item?.LogicalName}: AttributeType=${short(item?.AttributeType)} AttributeTypeName=${short(item?.AttributeTypeName)} IsValidForUpdate=${short(item?.IsValidForUpdate)} IsValidForCreate=${short(item?.IsValidForCreate)} RequiredLevel=${short(item?.RequiredLevel)} Targets=${short(item?.Targets)} Format=${short(item?.Format)} Behavior=${short(item?.Behavior)}`);
        }
        const missing = columns.filter((col) => !items.some((item) => item?.LogicalName === col));
        log(`R6 asked but not answered: ${short(missing)}`);
    } catch (e) {
        log(`R6 getEntityMetadata THREW ${fault(e)}`);
    }
    for (const other of ['contact', 'systemuser', 'team', site.lookup?.target ?? 'account']) {
        try {
            const t0 = performance.now();
            const md = await c.utils.getEntityMetadata(other);
            log(`R6 getEntityMetadata(${other}).EntitySetName=${short(md?.EntitySetName)} PrimaryIdAttribute=${short(md?.PrimaryIdAttribute)} in ${ms(t0)} ms`);
            if (site.lookup && other === site.lookup.target) {
                site.lookup.targetSet = md?.EntitySetName ?? null;
            }
        } catch (e) {
            log(`R6 getEntityMetadata(${other}) THREW ${fault(e)}`);
        }
    }
    try {
        const rr = await get(`${api}/EntityDefinitions(LogicalName='${table}')/Attributes?$select=LogicalName,AttributeType,IsValidForUpdate`, HEADERS);
        const all: any[] = rr.body?.value ?? [];
        const byName = (name: string): any => all.find((a) => a.LogicalName === name);
        log(`R6 EntityDefinitions/Attributes ${rr.status} in ${rr.ms} ms: ${all.length} attributes; address1_composite=${short(byName('address1_composite'))} createdon=${short(byName('createdon'))} name=${short(byName('name'))} parentaccountid=${short(byName('parentaccountid'))}`);
        const notUpdatable = all.filter((a) => a.IsValidForUpdate === false).map((a) => a.LogicalName);
        log(`R6 not IsValidForUpdate (${notUpdatable.length}): ${short(notUpdatable, 1200)}`);
    } catch (e) {
        log(`R6 EntityDefinitions/Attributes THREW ${fault(e)}`);
    }

    log('read half done. Press the buttons in order: R2, R2 undo, R3, R4, R8, R9.');
    return site;
}

/** `retrieveRecord` with `$select`, printed. */
async function readBack(site: Site, columns: string[], log: Log, label: string): Promise<any> {
    try {
        const t0 = performance.now();
        const row = await site.c.webAPI.retrieveRecord(site.table, site.recordId, `?$select=${columns.join(',')}`);
        const picked: Record<string, unknown> = {};
        for (const key of Object.keys(row || {})) {
            if (columns.some((col) => key === col || key === `_${col}_value` || key.startsWith(`${col}@`) || key.startsWith(`_${col}_value@`))) {
                picked[key] = row[key];
            }
        }
        log(`${label} read back in ${ms(t0)} ms: ${short(picked, 1200)}`);
        return row;
    } catch (e) {
        log(`${label} read back THREW ${fault(e)}`);
        return null;
    }
}

async function write(site: Site, payload: Record<string, unknown>, log: Log, label: string): Promise<boolean> {
    log(`${label} updateRecord(${site.table}, ${site.recordId}) payload=${short(payload, 1200)}`);
    try {
        const t0 = performance.now();
        const result = await site.c.webAPI.updateRecord(site.table, site.recordId, payload);
        log(`${label} RESOLVED in ${ms(t0)} ms: ${short(result)}`);
        return true;
    } catch (e) {
        log(`${label} REJECTED ${fault(e)}`);
        return false;
    }
}

/** R2: the old primitive values back, then the new ones back (undo). */
async function r2(site: Site, side: 'old' | 'new', log: Log): Promise<void> {
    const p = site.primitive;
    if (!p) {
        log('R2 no primitive candidate');
        return;
    }
    const from = side === 'old' ? p.oldBag : p.newBag;
    const payload: Record<string, unknown> = {};
    for (const column of p.columns) {
        // A column absent from the side is a clear — that is what restoring a `set` line is.
        payload[column] = Object.prototype.hasOwnProperty.call(from || {}, column) ? from[column] : null;
    }
    const label = side === 'old' ? 'R2 restore (old side)' : 'R2 undo (new side)';
    await readBack(site, p.columns, log, `${label} before`);
    await write(site, payload, log, label);
    await readBack(site, p.columns, log, `${label} after`);
}

/** R3: clear the lookup from its annotation, read back, set it back, read back. */
async function r3(site: Site, log: Log): Promise<void> {
    const l = site.lookup;
    if (!l) {
        log('R3 no lookup candidate');
        return;
    }
    const before = await readBack(site, [l.column], log, 'R3 before');
    const currentId: string | null = before?.[`_${l.column}_value`] ?? null;
    const targetSet = l.targetSet ?? `${l.target}s`;
    log(`R3 nav=${l.nav} target=${l.target} targetSet=${targetSet} (from getEntityMetadata: ${l.targetSet !== null}) currentId=${short(currentId)}`);
    if (currentId === null) {
        log('R3 the lookup is empty on the record — set Parent Account and run again');
        return;
    }
    await write(site, { [`${l.nav}@odata.bind`]: null }, log, 'R3 clear');
    await readBack(site, [l.column], log, 'R3 after clear');
    await write(site, { [`${l.nav}@odata.bind`]: `/${targetSet}(${currentId})` }, log, 'R3 set back');
    await readBack(site, [l.column], log, 'R3 after set back');
}

/** R4: the same record through openForm. */
async function r4(site: Site, log: Log): Promise<void> {
    const nav = site.c.navigation;
    if (typeof nav?.openForm !== 'function') {
        log('R4 navigation.openForm ABSENT');
        return;
    }
    log(`R4 the bound field's raw right now: ${short(site.c.parameters?.value?.raw, 120)} — compare with what R2 wrote`);
    try {
        const t0 = performance.now();
        const result = await nav.openForm({ entityName: site.table, entityId: site.recordId });
        log(`R4 openForm RESOLVED in ${ms(t0)} ms: ${short(result)} — did the form reload? is the R2 value showing? was there a prompt?`);
    } catch (e) {
        log(`R4 openForm REJECTED ${fault(e)}`);
    }
}

/** R8: page 1 again — the writes as audit rows. */
async function r8(site: Site, log: Log): Promise<void> {
    const target = encodeURIComponent(`{'@odata.id':'${site.entitySet}(${site.recordId})'}`);
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: 1, Count: 4, ReturnTotalRecordCount: true }));
    const r = await get(`${site.api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`, ANNOTATED);
    const list: any[] = r.body?.AuditDetailCollection?.AuditDetails ?? [];
    log(`R8 page 1 (4) ${r.status}: Total=${short(r.body?.AuditDetailCollection?.TotalRecordCount)}`);
    list.forEach((d, i) => {
        log(`R8 #${i} action=${short(d.AuditRecord?.action)} by=${short(d.AuditRecord?.[`_userid_value${F}`])} at=${short(d.AuditRecord?.[`createdon${F}`])} old=${short(d.OldValue, 500)} new=${short(d.NewValue, 500)} deleted=${short(d.DeletedAttributes?.Keys)}`);
    });
}

/** R9: three refusals. */
async function r9(site: Site, log: Log): Promise<void> {
    await write(site, { address1_composite: 'probe' }, log, 'R9 composite');
    await write(site, { createdon: '2020-01-01T00:00:00Z' }, log, 'R9 createdon');
    await write(site, { probe_no_such_column: 1 }, log, 'R9 unknown column');
    await write(site, { 'probe_no_such_nav@odata.bind': `/accounts(${site.recordId})` }, log, 'R9 unknown navigation property');
}

export const Probe: React.FC<ProbeProps> = (props) => {
    const [lines, setLines] = React.useState<string[]>([]);
    const [runs, setRuns] = React.useState(0);
    const site = React.useRef<Site | null>(null);
    const log = React.useCallback((line: string) => {
        console.log(TAG, line);
        setLines((prev) => [...prev, line]);
    }, []);

    React.useEffect(() => {
        setLines([]);
        log(`probe start (run ${runs + 1})`);
        readHalf(props.context, log).then((s) => {
            site.current = s;
        }).catch((e) => log(`probe THREW ${fault(e)}`));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs]);

    const button = (label: string, run: (site: Site) => Promise<void>): React.ReactElement =>
        React.createElement('button', {
            type: 'button',
            style: { margin: '4px 6px 4px 0' },
            onClick: () => {
                const s = site.current;
                if (!s) {
                    log(`${label}: the read half has not finished, or found no record`);
                    return;
                }
                run(s).catch((e) => log(`${label} THREW ${fault(e)}`));
            },
        }, label);

    return React.createElement(
        'div',
        { style: { fontFamily: 'Consolas, monospace', fontSize: 12, padding: 8 } },
        React.createElement('div', null, `${TAG} updateView passes: ${props.passes}`),
        React.createElement('div', null,
            React.createElement('button', { type: 'button', style: { margin: '4px 6px 4px 0' }, onClick: () => setRuns((n) => n + 1) }, 'Run the read half again'),
            button('R2 restore (WRITES old values)', (s) => r2(s, 'old', log)),
            button('R2 undo (WRITES new values)', (s) => r2(s, 'new', log)),
            button('R3 lookup clear + set back (WRITES)', (s) => r3(s, log)),
            button('R4 openForm same record', (s) => r4(s, log)),
            button('R8 read page 1 again', (s) => r8(s, log)),
            button('R9 three refusals (WRITES, all refused)', (s) => r9(s, log)),
        ),
        React.createElement('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 } }, lines.join('\n')),
    );
};
