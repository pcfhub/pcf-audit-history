import * as React from 'react';
import { Button, FluentProvider, Spinner, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { AuditRow, Change, Detail } from '../audit/types';
import { actionLabel } from '../audit/actions';
import { columnsOf } from '../audit/diff';
import { AuditSource } from '../data/AuditSource';
import { resolveEmpty } from '../state/emptyState';
import { columnsSeen, DetailState, detailsSettled, initialState, needsAutoContinue, pendingDetails, reduce, visibleRows } from '../state/reducer';

/** Every sentence the control can show, already resolved from the .resx. */
export interface Strings {
    noAccess: string;
    notAvailable: string;
    saveFirst: string;
    loading: string;
    noChanges: string;
    /** `{0}` is the column's name. */
    noChangesForColumn: string;
    auditOffOrg: string;
    auditOffTable: string;
    noPrivilege: string;
    loadFailed: string;
    detailFailed: string;
    detailPending: string;
    badSample: string;
    retry: string;
    loadMore: string;
    /** `{0}` shown of `{1}`. */
    showing: string;
    /** `{0}` changes. */
    showingCount: string;
    region: string;
    when: string;
    who: string;
    what: string;
    columnHeader: string;
    from: string;
    to: string;
    expand: string;
    collapse: string;
    /** `{0}` columns. */
    changedColumns: string;
    filterLabel: string;
    allColumns: string;
    /** `{0}` is the column's name. */
    onlyColumn: string;
    cleared: string;
    empty: string;
    unknownUser: string;
    truncated: string;
    noDetail: string;
    /** `{0}` is a principal. */
    sharedWith: string;
    /** `{0}` is a relationship's name. */
    relationship: string;
}

/** What the control has decided about the host, before any query runs. */
export type Mode = 'live' | 'sample' | 'not-available' | 'save-first' | 'no-access' | 'bad-sample';

export interface IProps {
    mode: Mode;
    /** Where the history comes from. `null` in every mode but `live` and `sample`. */
    resolve: (() => Promise<AuditSource>) | null;
    /**
     * Changes whenever anything the list was built from changes — the record,
     * the scope, the page size, the sample — and the list starts over. This
     * is how an input changed after `init` (the hub's preset switch) reaches
     * the component.
     */
    sourceKey: string;
    /** The bound column when *Only this column* is on, else `null`. */
    scope: string | null;
    /** The bound column's display name, for the scope chip. */
    columnLabel: string;
    /** Display names for columns, or `null` without the Utility feature. */
    readLabels: ((columns: string[]) => Promise<Record<string, string>>) | null;
    /** The sample's own labels, on the demo route. */
    sampleLabels: Record<string, string>;
    visible: boolean;
    label: string;
    isRTL: boolean;
    theme: ComponentFramework.Theme | undefined;
    /** `true`, `false`, or `undefined` for a host that publishes no theme. */
    dark: boolean | undefined;
    allocatedWidth: number | null;
    /** The .resx, for the action labels that are looked up by code. */
    getString: (key: string) => string;
    strings: Strings;
}

/** `{0}` → the value. The .resx moves the placeholder per language; the code never assumes where. */
export const fill = (template: string, value: string | number, second?: string | number): string =>
    template.replace('{0}', String(value)).replace('{1}', second === undefined ? '' : String(second));

/**
 * Below this width a row stacks its three cells and the values table drops
 * its header. Measured off the root, never queried off the viewport, and
 * never with `container-type` on the root — a shrink-to-fit form section
 * collapses that to a sliver.
 */
export const NARROW_BELOW = 480;

/** Fluent's 16px ChevronRight, as a path so it scales and follows `currentColor`. */
const Chevron = (): React.ReactElement => (
    <svg className="AuditHistory-chevron" width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
            fill="currentColor"
            d="M7.65 4.15c.2-.2.5-.2.7 0l5.49 5.46c.21.22.21.57 0 .78l-5.49 5.46a.5.5 0 0 1-.7-.7L12.8 10 7.65 4.85a.5.5 0 0 1 0-.7Z"
        />
    </svg>
);

export function AuditHistoryControl(props: IProps): React.ReactElement | null {
    const [state, dispatch] = React.useReducer(reduce, initialState);
    const source = React.useRef<AuditSource | null>(null);
    /*
     * Ids with a detail fetch in flight. The reducer marks them `loading`
     * too, but a dispatch from inside an effect re-runs the effect before the
     * loop below has finished, and a set the loop owns is what keeps the
     * second run from asking twice.
     */
    const inflight = React.useRef(new Set<string>());
    const [labels, setLabels] = React.useState<Record<string, string>>({});
    const askedLabels = React.useRef(new Set<string>());
    const rootRef = React.useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = React.useState(false);
    const { mode, resolve, sourceKey, scope, readLabels, sampleLabels, strings } = props;
    // The reducer's latest state, for a callback that must not close over a stale one.
    const stateRef = React.useRef(state);
    stateRef.current = state;

    const loadPage = React.useCallback((auto: boolean) => {
        const current = source.current;

        if (!current) {
            return;
        }

        dispatch({ type: 'pageRequested' });
        current.loadPage(stateRef.current.cursor).then(
            (page) => {
                if (source.current === current) {
                    dispatch({ type: 'pageLoaded', page, auto });
                }
            },
            (fault) => {
                if (source.current === current) {
                    dispatch({ type: 'pageFailed', fault });
                }
            },
        );
    }, []);

    /*
     * Start over whenever the source changes. The `alive` flag is what keeps a
     * slow answer for the previous key from landing in the new list — the
     * hub's demo switches presets faster than a query resolves.
     */
    React.useEffect(() => {
        let alive = true;

        dispatch({ type: 'reset' });
        source.current = null;
        inflight.current.clear();
        askedLabels.current.clear();
        setLabels({});

        if (!resolve || (mode !== 'live' && mode !== 'sample')) {
            return undefined;
        }

        resolve().then((resolved) => {
            if (!alive) {
                return;
            }

            source.current = resolved;
            loadPage(false);
            resolved.probeEnabled().then((enabled) => {
                if (alive && source.current === resolved) {
                    dispatch({ type: 'enabledKnown', enabled });
                }
            });
        });

        return () => {
            alive = false;
        };
    }, [sourceKey, mode, resolve, loadPage]);

    /*
     * Fetch the values of every row that has none — eagerly, the whole page
     * in parallel, because the column filter needs them and a row without
     * them cannot say what it touched.
     */
    React.useEffect(() => {
        const current = source.current;

        if (!current) {
            return;
        }

        const pending = pendingDetails(state).filter((id) => !inflight.current.has(id));

        if (pending.length === 0) {
            return;
        }

        dispatch({ type: 'detailRequested', ids: pending });

        for (const id of pending) {
            inflight.current.add(id);
            current
                .loadDetail(id)
                .then(
                    (detail) => {
                        if (source.current === current) {
                            dispatch({ type: 'detailLoaded', id, detail });
                        }
                    },
                    (fault) => {
                        if (source.current === current) {
                            dispatch({ type: 'detailFailed', id, fault });
                        }
                    },
                )
                .then(() => {
                    inflight.current.delete(id);
                });
        }
    }, [state]);

    /* A scoped list with nothing to show reads on, a few pages at most. */
    React.useEffect(() => {
        if (needsAutoContinue(state, scope)) {
            loadPage(true);
        }
    }, [state, scope, loadPage]);

    /* Display names for the columns seen so far, asked once each. */
    React.useEffect(() => {
        if (!readLabels) {
            return;
        }

        const unknown = columnsSeen(state).filter((column) => !askedLabels.current.has(column));

        if (unknown.length === 0) {
            return;
        }

        unknown.forEach((column) => askedLabels.current.add(column));
        readLabels(unknown).then(
            (found) => setLabels((previous) => ({ ...previous, ...found })),
            () => undefined,
        );
    }, [state, readLabels]);

    /*
     * Narrow is measured off the root's own width, never off a media query
     * (a form section on a wide screen can be narrow) and never with
     * `container-type` on the root.
     */
    React.useEffect(() => {
        const root = rootRef.current;

        if (!root || typeof ResizeObserver !== 'function') {
            return undefined;
        }

        const observer = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? 0;

            setNarrow(width > 0 && width < NARROW_BELOW);
        });

        observer.observe(root);

        return () => observer.disconnect();
    }, []);

    const effectiveScope = scope ?? state.filter;
    const rows = React.useMemo(() => visibleRows(state, effectiveScope), [state, effectiveScope]);
    const columns = React.useMemo(() => columnsSeen(state), [state]);
    const labelOf = (column: string): string => labels[column] ?? sampleLabels[column] ?? column;

    if (!props.visible) {
        return null;
    }

    const theme = props.theme ?? (props.dark ? webDarkTheme : webLightTheme);
    const className = [
        'AuditHistory',
        props.dark ? 'AuditHistory--dark' : '',
        narrow || (props.allocatedWidth !== null && props.allocatedWidth < NARROW_BELOW) ? 'AuditHistory--narrow' : '',
    ].filter(Boolean).join(' ');

    const message = (text: string, role?: 'alert'): React.ReactElement => (
        <p className="AuditHistory-message" role={role}>{text}</p>
    );

    let body: React.ReactNode;

    switch (mode) {
        case 'no-access': body = message(strings.noAccess); break;
        case 'not-available': body = message(strings.notAvailable); break;
        case 'save-first': body = message(strings.saveFirst); break;
        case 'bad-sample': body = message(strings.badSample, 'alert'); break;
        default: {
            const firstFailed = state.error !== null && state.rows.length === 0;
            const empty = resolveEmpty({
                outcome: firstFailed ? (state.error?.privilege ? 'privilege' : 'error') : 'ok',
                rowCount: state.rows.length,
                visibleCount: rows.length,
                scoped: effectiveScope !== null,
                enabled: state.enabled,
            });
            /*
             * Nothing to show yet, and something still deciding: a page in
             * flight, a scoped list whose values are still arriving, or one
             * about to read the next page on its own. The spinner, not a
             * sentence that the next tick would contradict.
             */
            const deciding = !state.started || state.loading !== null
                || (effectiveScope !== null && !firstFailed && (!detailsSettled(state) || needsAutoContinue(state, effectiveScope)));

            if (rows.length === 0 && !firstFailed && deciding) {
                body = (
                    <p className="AuditHistory-message AuditHistory-message--busy">
                        <Spinner size="tiny" aria-hidden="true" />
                        <span>{strings.loading}</span>
                    </p>
                );
            } else if (empty !== null) {
                const sentence =
                    empty === 'no-privilege' ? strings.noPrivilege
                        : empty === 'error' ? strings.loadFailed
                            : empty === 'audit-off-org' ? strings.auditOffOrg
                                : empty === 'audit-off-table' ? strings.auditOffTable
                                    : empty === 'no-changes-for-column' ? fill(strings.noChangesForColumn, labelOf(effectiveScope ?? ''))
                                        : strings.noChanges;

                body = (
                    <div className="AuditHistory-empty">
                        {scope === null && columns.length > 0 && (
                            <Toolbar
                                strings={strings}
                                columns={columns}
                                labelOf={labelOf}
                                filter={state.filter}
                                onFilter={(column) => dispatch({ type: 'setFilter', column })}
                                count={null}
                            />
                        )}
                        {message(sentence, empty === 'error' || empty === 'no-privilege' ? 'alert' : undefined)}
                        {empty === 'error' && (
                            <Button appearance="secondary" size="small" onClick={() => loadPage(false)}>{strings.retry}</Button>
                        )}
                    </div>
                );
            } else {
                /*
                 * The server's total, while there is more to load; the rows
                 * themselves once there is not. On the form (W7) the attribute
                 * function counted one more than it listed — the column's
                 * audit-configuration event, counted and not returned — and
                 * "Showing 3 of 4" with nothing more to load is a sentence
                 * that contradicts itself.
                 */
                const count = state.total !== null && state.cursor !== null
                    ? fill(strings.showing, rows.length, state.total)
                    : fill(strings.showingCount, rows.length);

                body = (
                    <>
                        {scope !== null ? (
                            <div className="AuditHistory-toolbar">
                                <span className="AuditHistory-chip">{fill(strings.onlyColumn, props.columnLabel || labelOf(scope))}</span>
                                <span className="AuditHistory-count">{count}</span>
                            </div>
                        ) : (
                            <Toolbar
                                strings={strings}
                                columns={columns}
                                labelOf={labelOf}
                                filter={state.filter}
                                onFilter={(column) => dispatch({ type: 'setFilter', column })}
                                count={count}
                            />
                        )}
                        <ul className="AuditHistory-list" role="list" aria-label={props.label || strings.region}>
                            {rows.map((row) => (
                                <ChangeRow
                                    key={row.id}
                                    row={row}
                                    detail={state.details[row.id]}
                                    expanded={state.expanded[row.id] === true}
                                    labelOf={labelOf}
                                    strings={strings}
                                    getString={props.getString}
                                    onToggle={() => dispatch({ type: 'toggle', id: row.id })}
                                />
                            ))}
                        </ul>
                        <div className="AuditHistory-footer">
                            {state.error !== null && (
                                <span className="AuditHistory-message AuditHistory-message--inline" role="alert">{strings.loadFailed}</span>
                            )}
                            {state.loading === 'more' ? (
                                <span className="AuditHistory-message AuditHistory-message--busy AuditHistory-message--inline">
                                    <Spinner size="tiny" aria-hidden="true" />
                                    <span>{strings.loading}</span>
                                </span>
                            ) : (state.cursor !== null || state.error !== null) && (
                                <Button appearance="secondary" size="small" onClick={() => loadPage(false)}>
                                    {state.error !== null ? strings.retry : strings.loadMore}
                                </Button>
                            )}
                        </div>
                    </>
                );
            }
        }
    }

    return (
        <FluentProvider theme={theme} dir={props.isRTL ? 'rtl' : 'ltr'} className={className}>
            <div className="AuditHistory-root" ref={rootRef}>
                {body}
            </div>
        </FluentProvider>
    );
}

interface ToolbarProps {
    strings: Strings;
    columns: string[];
    labelOf: (column: string) => string;
    filter: string | null;
    onFilter: (column: string | null) => void;
    count: string | null;
}

/**
 * The column filter — a native `<select>` styled with the tokens, because
 * a listbox that has to work under the hub's harness and the suite's stub
 * gains nothing from a portal — and the count.
 */
function Toolbar(props: ToolbarProps): React.ReactElement {
    const { strings } = props;
    const options = props.columns.slice().sort((a, b) => props.labelOf(a).localeCompare(props.labelOf(b)));

    return (
        <div className="AuditHistory-toolbar">
            <label className="AuditHistory-filter">
                <span className="AuditHistory-filter-label">{strings.filterLabel}</span>
                <select
                    className="AuditHistory-select"
                    value={props.filter ?? ''}
                    onChange={(event) => props.onFilter(event.target.value === '' ? null : event.target.value)}
                >
                    <option value="">{strings.allColumns}</option>
                    {options.map((column) => (
                        <option key={column} value={column}>{props.labelOf(column)}</option>
                    ))}
                </select>
            </label>
            {props.count !== null && <span className="AuditHistory-count">{props.count}</span>}
        </div>
    );
}

export interface RowProps {
    row: AuditRow;
    detail: DetailState | undefined;
    expanded: boolean;
    labelOf: (column: string) => string;
    strings: Strings;
    getString: (key: string) => string;
    onToggle: () => void;
}

/** What a closed row says about its values: the columns, or the kind of change. */
function summary(detail: DetailState | undefined, labelOf: (column: string) => string, strings: Strings): string {
    if (!detail) {
        return '';
    }

    if (detail.status === 'loading') {
        return '…';
    }

    if (detail.status === 'failed') {
        return strings.detailPending;
    }

    const d = detail.detail;

    if (d.kind === 'share') {
        return fill(strings.sharedWith, d.principal);
    }

    if (d.kind === 'relationship') {
        return fill(strings.relationship, d.name);
    }

    if (d.kind === 'other') {
        return d.type;
    }

    const columns = columnsOf(d);

    if (columns.length === 0) {
        return strings.noDetail;
    }

    return columns.length <= 3 ? columns.map(labelOf).join(', ') : fill(strings.changedColumns, columns.length);
}

/**
 * One change: a button row — when, who, what, and a summary of the columns
 * — and, open, the values: one line per column, old beside new.
 */
/** A row whose values are known to be nothing — an audit-configuration event — has nothing to open. */
function hasValues(detail: DetailState | undefined): boolean {
    if (!detail || detail.status !== 'loaded') {
        return true;
    }

    const d = detail.detail;

    return d.kind !== 'other' && !(d.kind === 'attributes' && d.changes.length === 0);
}

export function ChangeRow(props: RowProps): React.ReactElement {
    const { row, detail, strings } = props;
    const valuesId = `AuditHistory-values-${row.id}`;
    const action = actionLabel(row.action, row.actionText, props.getString);
    const openable = hasValues(detail);

    return (
        <li className={`AuditHistory-row${props.expanded && openable ? ' AuditHistory-row--open' : ''}${openable ? '' : ' AuditHistory-row--flat'}`}>
            <button
                type="button"
                className="AuditHistory-summary"
                aria-expanded={openable ? props.expanded : undefined}
                aria-controls={openable ? valuesId : undefined}
                aria-label={openable ? (props.expanded ? strings.collapse : strings.expand) : undefined}
                disabled={!openable}
                onClick={openable ? props.onToggle : undefined}
            >
                {openable ? <Chevron /> : <span className="AuditHistory-chevron AuditHistory-chevron--none" aria-hidden="true" />}
                <span className="AuditHistory-when">
                    <time dateTime={row.when || undefined}>{row.whenText || row.when}</time>
                </span>
                <span className="AuditHistory-who">{row.who || strings.unknownUser}</span>
                <span className="AuditHistory-what">
                    <span className="AuditHistory-action">{action}</span>
                    <span className="AuditHistory-columns">{summary(detail, props.labelOf, strings)}</span>
                </span>
            </button>
            {props.expanded && openable && (
                <div className="AuditHistory-values" id={valuesId}>
                    <Values detail={detail} labelOf={props.labelOf} strings={strings} />
                </div>
            )}
        </li>
    );
}

function Values(props: { detail: DetailState | undefined; labelOf: (column: string) => string; strings: Strings }): React.ReactElement {
    const { detail, strings } = props;

    if (!detail || detail.status === 'loading') {
        return (
            <p className="AuditHistory-message AuditHistory-message--busy">
                <Spinner size="tiny" aria-hidden="true" />
                <span>{strings.loading}</span>
            </p>
        );
    }

    if (detail.status === 'failed') {
        return <p className="AuditHistory-message" role="alert">{detail.privilege ? strings.noPrivilege : strings.detailFailed}</p>;
    }

    const d: Detail = detail.detail;

    if (d.kind === 'share') {
        return (
            <dl className="AuditHistory-facts">
                <dt>{fill(strings.sharedWith, d.principal)}</dt>
                <dd>{d.oldPrivileges || strings.empty} → {d.newPrivileges || strings.empty}</dd>
            </dl>
        );
    }

    if (d.kind === 'relationship') {
        return (
            <dl className="AuditHistory-facts">
                <dt>{fill(strings.relationship, d.name)}</dt>
                <dd>{d.targets.join(', ') || strings.empty}</dd>
            </dl>
        );
    }

    if (d.kind === 'other' || d.changes.length === 0) {
        return <p className="AuditHistory-message">{strings.noDetail}</p>;
    }

    return (
        <table className="AuditHistory-table">
            <thead>
                <tr>
                    <th scope="col">{strings.columnHeader}</th>
                    <th scope="col">{strings.from}</th>
                    <th scope="col">{strings.to}</th>
                </tr>
            </thead>
            <tbody>
                {d.changes.map((change) => (
                    <ValueRow key={change.column} change={change} label={props.labelOf(change.column)} strings={strings} />
                ))}
            </tbody>
        </table>
    );
}

function ValueRow(props: { change: Change; label: string; strings: Strings }): React.ReactElement {
    const { change, strings } = props;
    const cell = (text: string, absent: string): React.ReactElement =>
        text === '' ? <span className="AuditHistory-absent">{absent}</span> : <>{text}</>;

    return (
        <tr className={`AuditHistory-change AuditHistory-change--${change.kind}`}>
            <th scope="row">
                {props.label}
                {change.truncated && <span className="AuditHistory-note">{strings.truncated}</span>}
            </th>
            <td className="AuditHistory-old">{cell(change.oldText, strings.empty)}</td>
            <td className="AuditHistory-new">{cell(change.newText, change.kind === 'cleared' ? strings.cleared : strings.empty)}</td>
        </tr>
    );
}
