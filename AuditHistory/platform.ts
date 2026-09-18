/**
 * Everything read off `context`, in one file, each read guarded — because
 * every member here is one a host can withhold: `webAPI` and `utils` behind
 * optional features, `contextInfo` and `page` undocumented, `attributes`
 * absent on canvas. The rest of the control is written against what this
 * file returns, never against `context`.
 *
 * It is also the **only** file that calls `fetch`. `context.webAPI` addresses
 * records by entity name and nothing else; the audit *functions* and the
 * table's definition are URLs of their own on the organisation, reached by
 * one same-origin `fetch` helper below, so a header is written once.
 */

import { IInputs } from './generated/ManifestTypes';
import { bareId, Row } from './audit/rows';
import { detailsPath, isLogicalName, ORGANIZATION_QUERY, tableDefinitionPath } from './audit/query';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface QueryResult {
    entities: Row[];
    nextLink?: string;
}

/** The narrowest Web API the control uses, so the suite can hand in the rig's. */
export interface AuditWebApi {
    retrieveMultipleRecords(entity: string, options?: string, maxPageSize?: number): Promise<QueryResult>;
}

export interface HostReading {
    /** `context.webAPI` when it can query; `null` on canvas or a declined feature. */
    webAPI: AuditWebApi | null;
    /** The record's table, from `contextInfo` or the `recordEntity` input; `''` when neither says. */
    table: string;
    /** The record's id, bare and lower-case, from `contextInfo` or the `recordId` input; `null` on an unsaved record. */
    recordId: string | null;
    /** The bound column's logical name, or `''` when the host publishes no metadata. */
    column: string;
    /** The bound column's display name, or `''`. */
    columnLabel: string;
    /** The organisation URL a function `fetch` starts from, or `null`. */
    clientUrl: string | null;
    /** Reads display names for columns, or `null` without the Utility feature. */
    columnLabels: ((table: string, columns: string[]) => Promise<Record<string, string>>) | null;
    /**
     * The table's entity-set name (`accounts`), which the unbound functions
     * need for an entity reference — through `utils.getEntityMetadata` when
     * the host has it (1 ms, P11), else the `EntityDefinitions` fetch (P8),
     * else `null`, and never guessed from the logical name.
     */
    entitySet: (table: string) => Promise<string | null>;
    columnScope: boolean;
    pageSize: number | null;
    sampleData: string | null;
    /** The maker's label, for the accessible name. */
    label: string;
    readable: boolean;
    visible: boolean;
    isRTL: boolean;
    /** `true`, `false`, or `undefined` for a host that publishes no theme. */
    dark: boolean | undefined;
    allocatedWidth: number | null;
}

/** `attributes.LogicalName`, when it is a logical name. */
export function resolveBoundColumn(parameter: any): string {
    const name = parameter?.attributes?.LogicalName;

    return typeof name === 'string' && isLogicalName(name.toLowerCase()) ? name.toLowerCase() : '';
}

/**
 * The record's identity: `mode.contextInfo` first — undocumented, present on
 * a model-driven form, measured bare and lower-case — then the two inputs
 * the platform's FAQ says to bind. Each half validated, because a maker can
 * bind `recordId` to the wrong column and the query would then be sent.
 */
export function resolveRecord(context: ComponentFramework.Context<IInputs>): { table: string; recordId: string | null } {
    const info = (context.mode as any)?.contextInfo;
    const inputs: any = context.parameters;
    // The host's own answer is trusted as it comes; the maker's inputs are
    // held to a GUID, because a `recordId` bound to the wrong column would
    // otherwise be sent as a filter.
    const candidates: Array<[unknown, unknown, RegExp]> = [
        [info?.entityId, info?.entityTypeName, /^[0-9a-z-]+$/],
        [inputs?.recordId?.raw, inputs?.recordEntity?.raw, /^[0-9a-f-]{36}$/],
    ];

    for (const [id, table, shape] of candidates) {
        const bare = bareId(id);
        const name = typeof table === 'string' ? table.trim().toLowerCase() : '';

        if (bare !== null && shape.test(bare) && isLogicalName(name)) {
            return { table: name, recordId: bare };
        }
    }

    // A table without a record is still worth knowing: it names the
    // "save first" state's table and lets the auditing check run.
    const table = typeof info?.entityTypeName === 'string'
        ? info.entityTypeName.toLowerCase()
        : typeof inputs?.recordEntity?.raw === 'string' ? inputs.recordEntity.raw.trim().toLowerCase() : '';

    return { table: isLogicalName(table) ? table : '', recordId: null };
}

/**
 * `page.getClientUrl()` first — not in the typings, present on a model-driven
 * form, and the only honest answer on an on-premises organisation whose URL
 * carries the organisation in the path — then the `Xrm` global, then `null`.
 * Same order as `pcf-hierarchy-view` and `pcf-data-table`.
 */
export function lookupClientUrl(context: ComponentFramework.Context<IInputs>): string | null {
    const page = (context as any).page;

    try {
        const fromPage = typeof page?.getClientUrl === 'function' ? page.getClientUrl() : undefined;

        if (typeof fromPage === 'string' && fromPage !== '') {
            return fromPage.replace(/\/$/, '');
        }
    } catch {
        // Fall through to the global.
    }

    try {
        const xrm = (globalThis as any).Xrm;
        const fromGlobal = xrm?.Utility?.getGlobalContext?.()?.getClientUrl?.();

        if (typeof fromGlobal === 'string' && fromGlobal !== '') {
            return fromGlobal.replace(/\/$/, '');
        }
    } catch {
        // No global either.
    }

    return null;
}

/* ---- the one fetch helper ------------------------------------------------ */

export interface FetchAnswer {
    ok: boolean;
    status: number;
    body: any;
}

/**
 * One same-origin GET of the organisation's Web API. Resolves on any HTTP
 * status — a refusal is an answer the control names, not an exception — and
 * rejects only when there is no response at all (offline, a blocked origin),
 * which arrives as a `TypeError` from `fetch` itself.
 *
 * `Prefer: odata.include-annotations="*"` only when the caller reads
 * formatted values or lookup annotations off the answer; it is what puts
 * them there. `credentials: 'same-origin'` carries the form's session.
 */
export function fetchJson(clientUrl: string, path: string, annotations: boolean): Promise<FetchAnswer> {
    if (typeof fetch !== 'function') {
        return Promise.reject(new TypeError('fetch is not available'));
    }

    const headers: Record<string, string> = {
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
    };

    if (annotations) {
        headers.Prefer = 'odata.include-annotations="*"';
    }

    return fetch(`${clientUrl}/api/data/v9.2/${path}`, { headers, credentials: 'same-origin' })
        .then((response) =>
            response.json().then(
                (body) => ({ ok: response.ok, status: response.status, body }),
                () => ({ ok: response.ok, status: response.status, body: null }),
            ));
}

/** `audits(<id>)/…RetrieveAuditDetails`, annotated. */
export function retrieveAuditDetails(clientUrl: string, auditId: string): Promise<FetchAnswer> {
    return fetchJson(clientUrl, detailsPath(auditId), true);
}

/**
 * `EntityDefinitions(LogicalName='x')?$select=IsAuditEnabled,EntitySetName`,
 * read once per table and organisation. `IsAuditEnabled` is a
 * `BooleanManagedProperty`, read as `.Value` (measured: `{ Value,
 * CanBeChanged, ManagedPropertyLogicalName }`). Cached per organisation and
 * table for the life of the page; a failure is not cached.
 */
const definitionCache = new Map<string, Promise<{ audited: boolean | null; entitySet: string | null }>>();

export function tableDefinition(clientUrl: string, table: string): Promise<{ audited: boolean | null; entitySet: string | null }> {
    const key = `${clientUrl}|${table}`;
    const cached = definitionCache.get(key);

    if (cached) {
        return cached;
    }

    const answer = fetchJson(clientUrl, tableDefinitionPath(table), false)
        .then((response) => {
            if (!response.ok) {
                definitionCache.delete(key);
            }

            const audited = response.ok ? response.body?.IsAuditEnabled?.Value : undefined;
            const entitySet = response.ok ? response.body?.EntitySetName : undefined;

            return {
                audited: typeof audited === 'boolean' ? audited : null,
                entitySet: typeof entitySet === 'string' && entitySet !== '' ? entitySet : null,
            };
        })
        .catch(() => {
            definitionCache.delete(key);

            return { audited: null, entitySet: null };
        });

    definitionCache.set(key, answer);

    return answer;
}

/** For the suite, and for a page that changes organisation under the control — which no form does. */
export function forgetDefinitions(): void {
    definitionCache.clear();
}

/** `null` when the host could not say: a refused read is not "auditing is off". */
export function tableAuditEnabled(clientUrl: string, table: string): Promise<boolean | null> {
    return tableDefinition(clientUrl, table).then((definition) => definition.audited);
}

/** The function answers, annotated — the `AuditRecord`'s formatted values arrive only under `Prefer` (P13). */
export function retrieveHistory(clientUrl: string, path: string): Promise<FetchAnswer> {
    return fetchJson(clientUrl, path, true);
}

/** `organizations?$select=isauditenabled` through the Web API — the `maxuploadfilesize` pattern. */
export function orgAuditEnabled(webAPI: AuditWebApi): Promise<boolean | null> {
    return webAPI.retrieveMultipleRecords('organization', ORGANIZATION_QUERY, 1)
        .then((result) => {
            const value = result.entities?.[0]?.isauditenabled;

            return typeof value === 'boolean' ? value : null;
        })
        .catch(() => null);
}

/**
 * `getEntityMetadata(table, columns)` resolves with a class instance whose
 * `Attributes` is an item collection — read by name through `get()`, never
 * through `Object.keys`. A column it does not know keeps its logical name.
 */
function columnLabelsReader(context: ComponentFramework.Context<IInputs>): HostReading['columnLabels'] {
    const utils = (context as any).utils;

    if (typeof utils?.getEntityMetadata !== 'function') {
        return null;
    }

    return (table: string, columns: string[]) =>
        utils.getEntityMetadata(table, columns).then((metadata: any) => {
            const out: Record<string, string> = {};
            const attributes = metadata?.Attributes;

            for (const column of columns) {
                let attribute: any;

                try {
                    attribute = typeof attributes?.get === 'function' ? attributes.get(column) : attributes?.[column];
                } catch {
                    attribute = undefined;
                }

                const label = attribute?.DisplayName;

                if (typeof label === 'string' && label !== '') {
                    out[column] = label;
                } else if (label && typeof label === 'object') {
                    // A LocalizedLabel object on some hosts: { UserLocalizedLabel: { Label } }.
                    const text = label.UserLocalizedLabel?.Label ?? label.Label;

                    if (typeof text === 'string' && text !== '') {
                        out[column] = text;
                    }
                }
            }

            return out;
        });
}

function entitySetReader(context: ComponentFramework.Context<IInputs>, clientUrl: string | null): HostReading['entitySet'] {
    const utils = (context as any).utils;

    return (table: string) => {
        const fromUtils: Promise<string | null> = typeof utils?.getEntityMetadata === 'function'
            ? utils.getEntityMetadata(table).then(
                (metadata: any) => (typeof metadata?.EntitySetName === 'string' && metadata.EntitySetName !== '' ? metadata.EntitySetName : null),
                () => null,
            )
            : Promise.resolve(null);

        return fromUtils.then((name) => {
            if (name !== null || clientUrl === null) {
                return name;
            }

            return tableDefinition(clientUrl, table).then((definition) => definition.entitySet);
        });
    };
}

export function readHost(context: ComponentFramework.Context<IInputs>): HostReading {
    const parameter: any = context.parameters.value;
    const inputs: any = context.parameters;
    const webAPI: any = (context as any).webAPI;
    const clientUrl = lookupClientUrl(context);
    const security = parameter?.security;
    const width = context.mode.allocatedWidth;
    const record = resolveRecord(context);
    const pageSize = inputs?.pageSize?.raw;
    const sample = inputs?.sampleData?.raw;

    return {
        webAPI: webAPI && typeof webAPI.retrieveMultipleRecords === 'function' ? (webAPI as AuditWebApi) : null,
        table: record.table,
        recordId: record.recordId,
        column: resolveBoundColumn(parameter),
        columnLabel: typeof parameter?.attributes?.DisplayName === 'string' ? parameter.attributes.DisplayName : '',
        clientUrl,
        columnLabels: columnLabelsReader(context),
        entitySet: entitySetReader(context, clientUrl),
        columnScope: inputs?.columnScope?.raw === true,
        pageSize: typeof pageSize === 'number' ? pageSize : null,
        sampleData: typeof sample === 'string' ? sample : null,
        label: context.mode.label,
        // Compared against `false`, never read as a boolean — an unmapped
        // optional binding is `{}` and a column with no profile is `undefined`.
        readable: security?.readable !== false,
        visible: context.mode.isVisible,
        isRTL: context.userSettings.isRTL,
        dark: (context as any).fluentDesignLanguage?.isDarkTheme,
        allocatedWidth: typeof width === 'number' && width > 0 ? width : null,
    };
}
