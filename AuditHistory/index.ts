import * as React from 'react';
import { IInputs, IOutputs } from './generated/ManifestTypes';
import { AuditHistoryControl, IProps, Mode, Session, Strings } from './components/AuditHistoryControl';
import { createLiveSource, createSampleSource } from './data/AuditSource';
import { createLiveRestorer, createSampleRestorer } from './data/Restorer';
import { clampPageSize } from './audit/query';
import { readHost } from './platform';
import { parseSampleData } from './sample/parseSampleData';

/**
 * A virtual (React) field control that shows the record's audit history.
 * `getOutputs` is empty and the bound column is only read for its logical
 * name; the one write the control makes — a Restore, opt-in — goes through
 * `webAPI.updateRecord` on the record, never through the binding.
 *
 * `updateView` runs on every change to anything bound, so everything the list
 * is built from is folded into one `sourceKey`, and the component starts over
 * only when that string changes. The `resolve` function handed down is
 * memoised on the same key, because it is a dependency of the component's
 * effect and a fresh closure per pass would restart the load per pass.
 */
export class AuditHistory implements ComponentFramework.ReactControl<IInputs, IOutputs> {
    private resolved: { key: string; resolve: () => Promise<Session> } | null = null;

    public init(context: ComponentFramework.Context<IInputs>): void {
        // Ask for width changes; without this `allocatedWidth` is -1 forever.
        // Guarded because the hub's harness has no such method.
        if (typeof context.mode.trackContainerResize === 'function') {
            context.mode.trackContainerResize(true);
        }
    }

    public updateView(context: ComponentFramework.Context<IInputs>): React.ReactElement {
        const host = readHost(context);
        const pageSize = clampPageSize(host.pageSize);
        const strings = this.strings(context);

        let mode: Mode;
        let resolve: (() => Promise<Session>) | null = null;
        let key: string;
        /*
         * Restore is offered only where every half of it exists: the maker
         * turned it on, the form is not read-only, the user's roles allow a
         * write (`null` — the host cannot say — is not a refusal), and on
         * the live route a Web API that writes and a dialog that confirms.
         * The demo route needs neither, and simulates both.
         */
        const restoreWanted = host.showRestore && !host.disabled && host.writePrivilege !== false;
        let canRestore = false;
        // The column the list narrows to when *Only this column* is on. On
        // the sample route the sample names it, so the demo can show the
        // scope without a bound column.
        let scope: string | null = null;
        let columnLabel = host.columnLabel;
        let sampleLabels: Record<string, string> = {};

        if (!host.readable) {
            mode = 'no-access';
            key = mode;
        } else if (host.sampleData !== null && host.sampleData.trim() !== '') {
            // The demo route: a history the maker typed, and no query at all.
            const sample = parseSampleData(host.sampleData);

            if (sample) {
                const column = host.column || sample.column;

                mode = 'sample';
                scope = host.columnScope && column ? column : null;
                columnLabel = columnLabel || sample.labels[column] || column;
                sampleLabels = sample.labels;
                key = ['sample', scope ?? '', pageSize, host.sampleData].join('|');
                canRestore = restoreWanted;

                const who = host.userName;

                resolve = this.memo(key, () => Promise.resolve({
                    source: createSampleSource(sample, pageSize, scope),
                    restorer: createSampleRestorer(sample, {
                        who,
                        now: () => {
                            const at = new Date();

                            return { when: at.toISOString(), whenText: at.toLocaleString() };
                        },
                    }),
                }));
            } else {
                mode = 'bad-sample';
                key = mode;
            }
        } else if (host.webAPI === null && host.clientUrl === null) {
            // Neither route can answer: no Web API for the table, no
            // organisation URL for the functions. Canvas, and the hub.
            mode = 'not-available';
            key = mode;
        } else if (host.recordId === null || host.table === '') {
            mode = 'save-first';
            key = mode;
        } else {
            mode = 'live';
            scope = host.columnScope && host.column ? host.column : null;
            key = ['live', host.table, host.recordId, scope ?? '', pageSize, host.clientUrl ?? ''].join('|');

            const { webAPI, writeAPI, table, recordId, clientUrl, entitySet } = host;
            const column = scope;

            canRestore = restoreWanted && writeAPI !== null && host.confirm !== null;
            resolve = this.memo(key, async () => {
                // The unbound functions address the record as an entity
                // reference, which needs the entity-set name; without it
                // the table route is the only one, rows without values.
                const set = clientUrl === null ? null : await entitySet(table);
                const source = createLiveSource({ webAPI, clientUrl, entitySet: set, recordId, table, pageSize, column });

                if (source === null) {
                    throw { message: 'No route to the history.', privilege: false };
                }

                return {
                    source,
                    restorer: writeAPI === null ? null : createLiveRestorer({ webAPI: writeAPI, table, recordId, entitySet }),
                };
            });
        }

        const props: IProps = {
            mode,
            resolve,
            sourceKey: key,
            scope,
            columnLabel,
            readLabels: host.columnLabels && host.table
                ? ((columns) => (host.columnLabels as NonNullable<typeof host.columnLabels>)(host.table, columns))
                : null,
            sampleLabels,
            canRestore,
            confirm: host.confirm,
            openRecord: host.openRecord,
            readUpdatable: host.updatable && host.table
                ? ((columns) => (host.updatable as NonNullable<typeof host.updatable>)(host.table, columns))
                : null,
            visible: host.visible,
            label: host.label,
            isRTL: host.isRTL,
            theme: context.fluentDesignLanguage?.tokenTheme,
            dark: host.dark,
            allocatedWidth: host.allocatedWidth,
            getString: (name) => context.resources.getString(name),
            strings,
        };

        return React.createElement(AuditHistoryControl, props);
    }

    /** The control writes nothing. An empty bag is "no change" on every host. */
    public getOutputs(): IOutputs {
        return {};
    }

    public destroy(): void {
        this.resolved = null;
    }

    private memo(key: string, make: () => Promise<Session>): () => Promise<Session> {
        if (this.resolved === null || this.resolved.key !== key) {
            let promise: Promise<Session> | null = null;

            this.resolved = {
                key,
                resolve: () => {
                    promise = promise ?? make();
                    return promise;
                },
            };
        }

        return this.resolved.resolve;
    }

    private strings(context: ComponentFramework.Context<IInputs>): Strings {
        const s = (name: string): string => context.resources.getString(`AuditHistory_${name}`);

        return {
            noAccess: s('NoAccess'),
            notAvailable: s('NotAvailable'),
            saveFirst: s('SaveFirst'),
            loading: s('Loading'),
            noChanges: s('NoChanges'),
            noChangesForColumn: s('NoChangesForColumn'),
            auditOffOrg: s('AuditOffOrg'),
            auditOffTable: s('AuditOffTable'),
            noPrivilege: s('NoPrivilege'),
            loadFailed: s('LoadFailed'),
            detailFailed: s('DetailFailed'),
            detailPending: s('DetailPending'),
            badSample: s('BadSample'),
            retry: s('Retry'),
            loadMore: s('LoadMore'),
            showing: s('Showing'),
            showingCount: s('ShowingCount'),
            region: s('Region'),
            when: s('When'),
            who: s('Who'),
            what: s('What'),
            columnHeader: s('ColumnHeader'),
            from: s('From'),
            to: s('To'),
            expand: s('Expand'),
            collapse: s('Collapse'),
            changedColumns: s('ChangedColumns'),
            filterLabel: s('FilterLabel'),
            allColumns: s('AllColumns'),
            onlyColumn: s('OnlyColumn'),
            cleared: s('Cleared'),
            empty: s('Empty'),
            unknownUser: s('UnknownUser'),
            truncated: s('Truncated'),
            noDetail: s('NoDetail'),
            sharedWith: s('SharedWith'),
            relationship: s('Relationship'),
            restore: s('Restore'),
            restoreAll: s('RestoreAll'),
            restoring: s('Restoring'),
            restoreConfirmTitle: s('RestoreConfirmTitle'),
            restoreConfirmOne: s('RestoreConfirmOne'),
            restoreConfirmClear: s('RestoreConfirmClear'),
            restoreConfirmMany: s('RestoreConfirmMany'),
            restoreConfirmButton: s('RestoreConfirmButton'),
            cancel: s('Cancel'),
            restored: s('Restored'),
            restoredStale: s('RestoredStale'),
            refresh: s('Refresh'),
            dismiss: s('Dismiss'),
            restoreFailed: s('RestoreFailed'),
            noWritePrivilege: s('NoWritePrivilege'),
        };
    }
}
