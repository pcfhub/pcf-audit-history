/**
 * The list's state, as a reducer the component drives and the suite drives
 * directly. Rows arrive a page at a time and are appended; each row's values
 * arrive on their own and are kept by id, so a page whose values are still
 * loading renders its rows at once and fills in.
 */

import { AuditPage, AuditRow, Cursor, Detail, SourceFault } from '../audit/types';
import { columnsOf } from '../audit/diff';
import { MAX_AUTO_PAGES } from '../audit/query';

export type DetailState =
    | { status: 'loading' }
    | { status: 'loaded'; detail: Detail }
    | { status: 'failed'; message: string; privilege: boolean };

export interface Enabled {
    /** `null` until asked, or when the host could not say. */
    org: boolean | null;
    table: boolean | null;
}

export interface State {
    rows: AuditRow[];
    details: Record<string, DetailState>;
    cursor: Cursor | null;
    total: number | null;
    /** A page has been asked for since the last reset — before that, nothing is known and nothing is shown. */
    started: boolean;
    /** `'first'` while the first page loads, `'more'` while a later one does. */
    loading: 'first' | 'more' | null;
    /** The first page's failure; a later page's failure keeps the rows and shows the sentence. */
    error: SourceFault | null;
    expanded: Record<string, true>;
    /** The column the filter narrows to, or `null` for all. */
    filter: string | null;
    enabled: Enabled;
    /** Pages loaded by the scope on its own, looking for a match. */
    autoPages: number;
}

export type Action =
    | { type: 'reset' }
    | { type: 'pageRequested' }
    | { type: 'pageLoaded'; page: AuditPage; auto: boolean }
    | { type: 'pageFailed'; fault: SourceFault }
    | { type: 'detailRequested'; ids: string[] }
    | { type: 'detailLoaded'; id: string; detail: Detail }
    | { type: 'detailFailed'; id: string; fault: SourceFault }
    | { type: 'toggle'; id: string }
    | { type: 'setFilter'; column: string | null }
    | { type: 'enabledKnown'; enabled: Enabled };

export const initialState: State = {
    rows: [],
    details: {},
    cursor: null,
    total: null,
    started: false,
    loading: null,
    error: null,
    expanded: {},
    filter: null,
    enabled: { org: null, table: null },
    autoPages: 0,
};

export function reduce(state: State, action: Action): State {
    switch (action.type) {
        case 'reset':
            return initialState;

        case 'pageRequested':
            return { ...state, started: true, loading: state.rows.length === 0 ? 'first' : 'more', error: null };

        case 'pageLoaded': {
            const seen = new Set(state.rows.map((row) => row.id));
            const fresh = action.page.rows.filter((row) => !seen.has(row.id));

            return {
                ...state,
                rows: [...state.rows, ...fresh],
                cursor: action.page.next,
                total: action.page.total ?? state.total,
                loading: null,
                autoPages: action.auto ? state.autoPages + 1 : state.autoPages,
            };
        }

        case 'pageFailed':
            return { ...state, loading: null, error: action.fault };

        case 'detailRequested': {
            const details = { ...state.details };

            for (const id of action.ids) {
                if (!details[id]) {
                    details[id] = { status: 'loading' };
                }
            }

            return { ...state, details };
        }

        case 'detailLoaded':
            return { ...state, details: { ...state.details, [action.id]: { status: 'loaded', detail: action.detail } } };

        case 'detailFailed':
            return {
                ...state,
                details: { ...state.details, [action.id]: { status: 'failed', message: action.fault.message, privilege: action.fault.privilege } },
            };

        case 'toggle': {
            const expanded = { ...state.expanded };

            if (expanded[action.id]) {
                delete expanded[action.id];
            } else {
                expanded[action.id] = true;
            }

            return { ...state, expanded };
        }

        case 'setFilter':
            return { ...state, filter: action.column, autoPages: 0 };

        case 'enabledKnown':
            return { ...state, enabled: action.enabled };

        default:
            return state;
    }
}

/* ---- selectors ---------------------------------------------------------- */

/** The rows whose values have not been asked for yet. */
export function pendingDetails(state: State): string[] {
    return state.rows.filter((row) => !state.details[row.id]).map((row) => row.id);
}

/** Every column any loaded detail touched, first seen first. */
export function columnsSeen(state: State): string[] {
    const out: string[] = [];

    for (const row of state.rows) {
        const detail = state.details[row.id];

        if (detail?.status === 'loaded') {
            for (const column of columnsOf(detail.detail)) {
                if (!out.includes(column)) {
                    out.push(column);
                }
            }
        }
    }

    return out;
}

/**
 * The rows the list shows under a scope — the bound column when *Only this
 * column* is on, else the filter, else every row. A row whose values are
 * still loading is hidden until they arrive; one whose values **failed** is
 * shown, because nothing can say it did not touch the column.
 */
export function visibleRows(state: State, scope: string | null): AuditRow[] {
    if (scope === null) {
        return state.rows;
    }

    return state.rows.filter((row) => {
        const detail = state.details[row.id];

        if (!detail || detail.status === 'loading') {
            return false;
        }

        return detail.status === 'failed' || columnsOf(detail.detail).includes(scope);
    });
}

/** Whether every requested detail has settled. */
export function detailsSettled(state: State): boolean {
    return state.rows.every((row) => {
        const detail = state.details[row.id];

        return detail !== undefined && detail.status !== 'loading';
    });
}

/**
 * A scoped list with nothing to show and more pages to read loads the next
 * one on its own — up to `MAX_AUTO_PAGES`, so a column that never changed
 * does not walk the whole history.
 */
export function needsAutoContinue(state: State, scope: string | null): boolean {
    return scope !== null
        && state.loading === null
        && state.error === null
        && state.cursor !== null
        && state.autoPages < MAX_AUTO_PAGES
        && detailsSettled(state)
        && visibleRows(state, scope).length === 0;
}
