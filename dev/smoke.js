/*
 * Drives the real built bundle outside a browser.
 *
 *     npm run build && npm run smoke
 *
 * What it does: installs the DOM and the platform globals, loads
 * `out/controls/AuditHistory/bundle.js` the way a form would, drives the control
 * through the states a form can put it in, and asserts what it did.
 *
 * Why it exists alongside `npm start` and `dev/harness.html`: both of those
 * *show* you the control, and the states that matter most are ones nobody
 * thinks to look at — a column the user cannot read, a business rule that
 * failed, a host with no column metadata, a cleared value that has to travel
 * back as `null` rather than `undefined`. Those are decisions, they are what
 * regresses, and here they are assertions with an exit code.
 *
 * Why no test framework: there is none in this repository, and adding one to
 * run a handful of assertions against a bundle would be a dependency, a config
 * file and a second build pipeline for something `node` already does. It also
 * runs the **built bundle** rather than the TypeScript sources, which is the
 * part worth checking — webpack, the externals and the manifest all sit between
 * the source and what a form actually loads. CI runs it after the msbuild pack,
 * so there it drives the production bundle.
 *
 * **What passing here does NOT mean.** Every value below is supplied by this
 * file. It cannot tell you that the control looks right, that the stylesheet
 * applies, that focus order works, that a real form hands down what these
 * fixtures hand down, or that a save persists anything. Keep the answers to
 * those in SPEC.md under "Not verified".
 *
 * **If the bundle will not load here at all**, because it carries a browser
 * application that reads `document` at module scope — a Monaco, a map, a
 * charting library — do not grow `dom.js` to meet it. Keep the control's
 * decisions in modules that import nothing of the library, and drive those
 * instead: `pcf-code-editor`'s `dev/smoke.js` transpiles them with the
 * TypeScript already in devDependencies and refuses one that imports the
 * library. The skill has the shape under *When the bundle cannot load in
 * Node*.
 *
 * **And a stub must never be more capable than the thing it stands in for.**
 * `dev/host.js` withholds `security`, `attributes` and `fluentDesignLanguage`
 * exactly where the platform withholds them. When you add to it, stub the
 * refusals first — the argument the call requires, the field it omits, the
 * empty collection it hands back. If you cannot say what the real call
 * withholds, the stub is a guess and the assertions resting on it prove
 * nothing.
 *
 * ---
 *
 * **The assertions below the divider are a worked example. Replace them.**
 * Everything above the divider is plumbing that works for any field control;
 * the examples exercise the scaffolded control and are meant to be thrown away
 * with it.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Resolved from this file rather than from the working directory, so the script
// behaves the same run directly or through npm.
const root = path.join(__dirname, '..');
const dom = require('./dom.js');
const host = require('./host.js');
const clock = require('./clock.js');
const fixture = require('./fixture.js');

const BUNDLE = path.join(root, 'out', 'controls', 'AuditHistory', 'bundle.js');

if (!fs.existsSync(BUNDLE)) {
    console.error('\n  No bundle at out/controls/AuditHistory. Run npm run build first.\n');
    process.exit(1);
}

/* ----------------------------------------------------------- the platform */

dom.install(global);

/*
 * Time, replaced with something the test drives.
 *
 * `vm.runInThisContext` below evaluates the bundle in *this* realm, so the
 * `Date`, `setInterval` and `setTimeout` the control closes over are the ones
 * installed here. That is what makes a control with a clock testable without
 * an injectable clock parameter — which would be production code bent to suit
 * a harness, and the only reason that seam would exist.
 *
 * A control with no timers is unaffected by this: nothing schedules, nothing
 * fires, and `time.pending()` stays at zero. Keep it anyway — the teardown
 * assertion at the bottom of this file is written against it, and it is the
 * assertion worth keeping when the worked example goes.
 *
 * The start value is arbitrary and fixed. A suite that starts at "now" asserts
 * something slightly different every time it runs.
 */
const time = clock.install(Date.UTC(2026, 0, 1, 12, 0, 0), global);

const registration = host.captureRegistration(global);

const source = fs.readFileSync(BUNDLE, 'utf8');

/*
 * The platform libraries, supplied under the names the bundle actually asks
 * for — read out of the bundle rather than written down here.
 *
 * A `<platform-library>` entry becomes a webpack external, and the global it
 * compiles to carries a version in its name. **That version is not the one the
 * manifest declares.** `pcf-scripts` maps a declared version onto the platform
 * build it supports, so Fluent `9.46.2` arrives as `FluentUIReactv940` and
 * React `16.14.0` as `Reactv16`. Hardcoding either is a trap that springs on
 * the next version bump, with a `ReferenceError` naming a global that appears
 * nowhere in the repository.
 *
 * A standard control has no externals at all, in which case both lists are
 * empty and nothing below runs.
 */
const reactGlobals = [...new Set(source.match(/\bReactv[\w]*\b/g) || [])];
const fluentGlobals = [...new Set(source.match(/\bFluentUIReact[\w]*\b/g) || [])];

let React = null;

if (reactGlobals.length > 0) {
    React = require(path.join(root, 'node_modules', 'react'));
    reactGlobals.forEach((name) => {
        global[name] = React;
    });
}

/*
 * Fluent is stubbed rather than loaded, the way the grid rig stubs it: every
 * component resolves to its own name as an element type, so
 * `React.createElement(Input, …)` produces `{ type: 'Input', props }` and the
 * props the control passed survive for inspection. These assertions are about
 * the control's decisions, not about how Fluent renders them — and Fluent 9
 * ships no UMD build, so there is nothing to load in a browser either.
 */
/*
 * **A stand-in component per name, not the name as the element type.** React
 * lower-cases an unknown element, so `MenuItem` became `<menuitem>` — which
 * HTML treats as a void element, and `renderToStaticMarkup` throws rather
 * than give it children. Every capitalised export is therefore a function
 * component rendering a `<div data-fluent="Name">` with the string, number
 * and boolean props the control passed — className, aria-*, title, disabled
 * — so `renderDeep` can look for them; a lower-case export (`webLightTheme`,
 * `tokens`) is a plain object. Found by `pcf-calendar-view`, whose move menu
 * was the first `MenuItem` a suite tried to render.
 */
const standIns = new Map();

function fluentStandIn(name) {
    if (!standIns.has(name)) {
        const StandIn = (props) => {
            const passed = { 'data-fluent': name };

            Object.keys(props || {}).forEach((key) => {
                const value = props[key];

                if (key !== 'children' && ['string', 'number', 'boolean'].includes(typeof value)) {
                    passed[key] = value;
                }
            });

            return React.createElement('div', passed, props.children);
        };

        StandIn.displayName = name;
        standIns.set(name, StandIn);
    }

    return standIns.get(name);
}

const fluent = new Proxy({}, {
    get: (_target, name) => {
        if (typeof name !== 'string') {
            return undefined;
        }

        return /^[A-Z]/.test(name) ? fluentStandIn(name) : {};
    },
});

fluentGlobals.forEach((name) => {
    global[name] = fluent;
});

vm.runInThisContext(source, { filename: 'bundle.js' });

/* ---------------------------------------------------------------- harness */

const results = [];

function check(label, ok, detail) {
    results.push({ ok, label, detail });
}

// `getString` returns a marked key rather than a real string, so an assertion
// can tell "read from the .resx" apart from "hardcoded in the source" — which
// would otherwise look identical in the output.
const marked = (key) => `resx:${key}`;

/**
 * Mount a fresh control in a given state and hand back everything worth
 * asserting about it.
 *
 * A new instance per state on purpose: `init` runs once per control on a real
 * form, so a suite that reused one instance would be testing a sequence the
 * platform never produces. Where the *sequence* is the point — a value arriving
 * after an edit — drive `updateView` again through the returned handle.
 */
/**
 * Every control mounted and not yet destroyed.
 *
 * A suite that mounts and walks away is testing something other than what it
 * says: an abandoned control keeps its interval and its `document` listeners,
 * so the next section's counts include them and the next event dispatched at
 * `document` reaches all of them. That is the leak the teardown assertion
 * exists to catch, and asserting it from inside one proves nothing.
 */
const live = [];

function disposeAll() {
    while (live.length > 0) {
        live.pop().destroy();
    }
}

function mount(options) {
    const container = dom.createElement('div');
    /*
     * What is the *instance's* rather than the render's: the call log, the
     * organisation URL and the rows behind the Web API. `createContext` runs
     * per render, so these are decided once here and handed to every context
     * this mount builds — `update()` included, which used to drop `calls` and
     * so could not record what a re-render made the control do.
     */
    const site = { calls: [], clientUrl: options.clientUrl || host.nextClientUrl(), fixture: options.fixture || fixture };
    // `getString` first, so a single assertion can override it — the marked key
    // proves a string came from the .resx, but it cannot prove a `{0}` was
    // substituted, because a marked key has no `{0}` in it to substitute.
    const context = host.createContext({ getString: marked, ...options, ...site });
    const instance = new registration.ctor();

    let notifications = 0;

    /*
     * The third argument is the state a previous mount handed to
     * `mode.setControlState`, and it was hard-coded to `{}` here — which made
     * the *return* half of that API unreachable from a suite. Pass `state` in
     * `options` to mount a control the way the platform remounts one after a
     * form tab switch. `{}` remains the default, because that is a first mount.
     */
    instance.init(context, () => {
        notifications += 1;
    }, options.state || {}, container);

    // A standard control returns nothing and has written into `container`; a
    // virtual one returns the element it wants rendered and was handed no
    // container at all.
    const element = instance.updateView(context);

    const handle = {
        instance,
        container,
        element,
        props: () => (element && element.props) || {},
        outputs: () => instance.getOutputs(),
        notifications: () => notifications,
        /** Every platform call the control made, on any pass. */
        calls: () => site.calls,
        /** The organisation URL this instance's `page.getClientUrl()` answers. */
        clientUrl: site.clientUrl,
        /** Re-render in a new state, as the platform does on every change. */
        update: (next) => instance.updateView(host.createContext({ getString: marked, ...options, ...site, ...next })),
        /** Unmount, as the platform does when the form closes or navigates. */
        destroy: () => {
            instance.destroy();

            const at = live.indexOf(handle);

            if (at !== -1) {
                live.splice(at, 1);
            }
        },
        find: (selector) => container.querySelector(selector),
    };

    live.push(handle);

    return handle;
}

check('bundle registered a control', typeof registration.ctor === 'function');

if (typeof registration.ctor !== 'function') {
    report();
}

/* ======================================================================== *
 *  AUDIT HISTORY — what the control decides, asserted two ways.
 *
 *  The **pure modules** (`audit/`, `state/`, `sample/`, `data/`, `platform.ts`)
 *  are transpiled straight from source and driven directly: the exact query
 *  a server would receive, every row and detail shape reduced, every reducer
 *  transition, the live source against the rig's Web API and its fetch stub.
 *  The **bundle** is mounted through `mount()` and read through the props it
 *  hands the component, which are its decisions about the host: which of the
 *  six modes, what key the list is built from, what scope.
 *
 *  What neither can prove: that a real form's audit rows carry formatted
 *  values, that the PCF Web API follows its own nextLink, or what a cleared
 *  column looks like in an AuditDetail — SPEC.md's P2, P3 and P5, and every
 *  other row of its *Measured* table.
 * ======================================================================== */

const ts = require(path.join(root, 'node_modules', 'typescript'));

/**
 * Render an element all the way down with `react-dom/server`, which needs no
 * DOM. Fluent is the stand-in, so a component renders as
 * `<div data-fluent="Name">`; the assertions are about what the control put
 * in the markup, never about Fluent. Effects do not run here, so this reaches
 * the synchronous states only — the tree after loading is rendered through
 * `TreeRow` from reducer state below.
 */
function renderDeep(element) {
    if (element === undefined || element === null || React === null) {
        return null;
    }

    const server = require(path.join(root, 'node_modules', 'react-dom', 'server'));
    const warn = console.error;
    console.error = () => {};

    try {
        return server.renderToStaticMarkup(element);
    } finally {
        console.error = warn;
    }
}
const { Module } = require('module');
const src = path.join(root, 'AuditHistory');

/**
 * Transpile one source file and evaluate it as its own module. Relative
 * imports come back through here; `react` is the React the bundle got;
 * `@fluentui/react-components` is the same stand-in Proxy the bundle got, so a
 * transpiled component renders to `<div data-fluent="Name">` too.
 */
const moduleCache = new Map();

function load(name) {
    if (moduleCache.has(name)) {
        return moduleCache.get(name).exports;
    }

    const file = path.join(src, `${name}.ts${fs.existsSync(path.join(src, `${name}.tsx`)) ? 'x' : ''}`);
    const source = fs.readFileSync(file, 'utf8');
    const { outputText, diagnostics } = ts.transpileModule(source, {
        fileName: file,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
        reportDiagnostics: true,
    });

    if (diagnostics && diagnostics.length > 0) {
        throw new Error(`${name}: ${diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n')}`);
    }

    const mod = new Module(file, module);
    mod.filename = file;
    mod.paths = Module._nodeModulePaths(src);
    moduleCache.set(name, mod);
    mod.require = function (request) {
        if (request.startsWith('.')) {
            return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), request)));
        }
        if (request === 'react') {
            return React;
        }
        if (request === '@fluentui/react-components') {
            return fluent;
        }
        return Module.prototype.require.call(this, request);
    };
    mod._compile(outputText, file);

    return mod.exports;
}

const Rw = load('audit/rows');
const A = load('audit/actions');
const Df = load('audit/diff');
const Qy = load('audit/query');
const St = load('state/reducer');
const Em = load('state/emptyState');
const Sp = load('sample/parseSampleData');
const Ds = load('data/AuditSource');
const P = load('platform');
const Cm = load('components/AuditHistoryControl');

const audits = fixture.tables.audit;
const detailOf = (n) => fixture.audits.details[audits[n - 1].auditid];
const RECORD = { entityId: '{C1C1C1C1-0000-0000-0000-000000000001}', entityTypeName: 'account' };
const G1 = 'c1c1c1c1-0000-0000-0000-000000000001';

/* --------------------------------------------------------------- the rows */

const first = Rw.toRow(audits[0]);

check(
    'a row keeps the id, the instant, the platform\'s formatting, the user and the action',
    first.id === audits[0].auditid && first.when === '2026-09-18T14:05:00Z' && first.whenText === '9/18/2026 2:05 PM'
        && first.who === 'Alex Chen' && first.whoId === fixture.users.alex.id && first.action === 2 && first.actionText === 'Update',
    JSON.stringify(first),
);
check('a row without an auditid is not a row', Rw.toRow({ createdon: 'x' }) === null && Rw.toRows([{}, audits[0]]).length === 1);
check('a row with nothing formatted degrades to empty strings, not undefined', (() => {
    const bare = Rw.toRow({ auditid: 'A0', action: '13' });
    return bare.when === '' && bare.whenText === '' && bare.who === '' && bare.whoId === null && bare.action === 13 && bare.actionText === '';
})());

/* ------------------------------------------------------------ the actions */

check('the platform\'s own label wins over the table', A.actionLabel(2, 'Aktualisiert', marked) === 'Aktualisiert');
check('a known code without a label reads from the .resx', A.actionLabel(41, '', marked) === 'resx:AuditHistory_ActionSetState' && A.actionLabel(14, '', marked) === 'resx:AuditHistory_ActionShare');
check('an unknown code names itself rather than going blank', A.actionLabel(77, '', (k) => (k === 'AuditHistory_ActionOther' ? 'Action {0}' : k)) === 'Action 77');

/* ------------------------------------------------------------- the differ */

const setLookup = Df.diffDetail({ AuditDetail: detailOf(2) });
check(
    'a lookup set: one change, the column folded from _x_value, the formatted name as the text',
    setLookup.kind === 'attributes' && setLookup.changes.length === 1
        && setLookup.changes[0].column === 'parentaccountid' && setLookup.changes[0].kind === 'set'
        && setLookup.changes[0].oldText === '' && setLookup.changes[0].newText === 'Contoso Europe',
    JSON.stringify(setLookup),
);
const cleared = Df.diffDetail(detailOf(3));
check(
    'a column cleared: absent from NewValue and named in DeletedAttributes → cleared, the old text kept',
    cleared.changes.length === 1 && cleared.changes[0].kind === 'cleared' && cleared.changes[0].oldText === 'https://www.contoso.de' && cleared.changes[0].newText === '',
    JSON.stringify(cleared),
);
check(
    'a column present as null in NewValue is cleared too',
    Df.diffAttributes({ name: 'A' }, { name: null }, [])[0].kind === 'cleared',
);
const choice = Df.diffDetail(detailOf(4));
check('a choice shows its labels, not its integers', choice.changes[0].oldText === 'Accounting' && choice.changes[0].newText === 'Business Services' && choice.changes[0].kind === 'changed');
const capped = Df.diffDetail(detailOf(5));
check('a value at the 5 KB cap is flagged', capped.changes[0].truncated === true && Df.isTruncated('short…') === false);
const two = Df.diffDetail(detailOf(6));
check('two columns in one change are two lines, in NewValue\'s order', two.changes.map((c) => c.column).join(',') === 'statecode,statuscode');
const created = Df.diffDetail(detailOf(26));
check('a Create is every column as set', created.changes.length === 4 && created.changes.every((c) => c.kind === 'set'));
const share = Df.diffDetail(detailOf(8));
check('a Share is its own kind, with the principal and the privileges', share.kind === 'share' && share.principal === 'Alex Chen' && share.newPrivileges === 'ReadAccess, WriteAccess');
const rel = Df.diffDetail(detailOf(9));
check('a Relationship is its own kind, with the name and the targets', rel.kind === 'relationship' && rel.name === 'accountleads_association' && rel.targets[0] === 'Nina Vogel');
check('an unknown detail type is named, not rendered as an empty change', Df.diffDetail({ '@odata.type': '#Microsoft.Dynamics.CRM.UserAccessAuditDetail', AccessTime: 'x' }).kind === 'other');
check('the same text on both sides is not a change', Df.diffAttributes({ name: 'A' }, { name: 'A' }, []).length === 0);
check('annotation keys never become columns', Df.diffAttributes({}, { '_ownerid_value@Microsoft.Dynamics.CRM.lookuplogicalname': 'team', _ownerid_value: 'x' }, []).map((c) => c.column).join() === 'ownerid');
check('a money column\'s _base shadow is folded into it', Df.diffAttributes({ creditlimit: 30, creditlimit_base: 30 }, { creditlimit: 40, creditlimit_base: 40 }, []).map((c) => c.column).join() === 'creditlimit' && Df.diffAttributes({}, { revenue_base: 1 }, []).map((c) => c.column).join() === 'revenue_base');
check('columnsOf reads an attributes detail and nothing else', Df.columnsOf(two).join() === 'statecode,statuscode' && Df.columnsOf(share).length === 0);

/* ------------------------------------------------------------ the queries */

check('pageSize is clamped: blank → 20, 0 → 1, 500 → 100, 7.9 → 7', Qy.clampPageSize(null) === 20 && Qy.clampPageSize(0) === 1 && Qy.clampPageSize(500) === 100 && Qy.clampPageSize(7.9) === 7 && Qy.clampPageSize('x') === 20);
check(
    'the audits query is the documented spelling, newest first, filtered on _objectid_value',
    Qy.auditsQuery(G1) === `?$select=auditid,createdon,action,operation,_userid_value&$filter=_objectid_value eq ${G1}&$orderby=createdon desc`,
    Qy.auditsQuery(G1),
);
check('the bound function hangs off the audit row', Qy.detailsPath('a1') === 'audits(a1)/Microsoft.Dynamics.CRM.RetrieveAuditDetails');
check('the unbound function carries its arguments as encoded @-aliases', decodeURIComponent(Qy.changeHistoryPath('accounts', G1, { pageNumber: 2, count: 10 })) === `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t={'@odata.id':'accounts(${G1})'}&@p={"PageNumber":2,"Count":10,"ReturnTotalRecordCount":true}`);
check('a cookie rides in PagingInfo when the previous page gave one', decodeURIComponent(Qy.changeHistoryPath('accounts', G1, { pageNumber: 2, count: 10, cookie: '<c/>' })).includes('"PagingCookie":"<c/>"'));
check('the attribute function names the column as a quoted alias', decodeURIComponent(Qy.attributeHistoryPath('accounts', G1, 'name', { pageNumber: 1, count: 5 })).includes("AttributeLogicalName=@a,PagingInfo=@p)?@t={'@odata.id':'accounts(") && decodeURIComponent(Qy.attributeHistoryPath('accounts', G1, 'name', { pageNumber: 1, count: 5 })).includes("&@a='name'&@p="));
check('the table definition path selects IsAuditEnabled and the entity set', Qy.tableDefinitionPath('account') === "EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled,EntitySetName");

/* ------------------------------------------------------------ the reducer */

const rows = Rw.toRows(audits.slice(0, 3));
let s = St.reduce(St.initialState, { type: 'pageRequested' });
check('the first request is "first" and marks the list started', s.loading === 'first' && s.started === true && St.initialState.started === false);
s = St.reduce(s, { type: 'pageLoaded', page: { rows, next: { kind: 'nextLink', url: 'u' }, total: null }, auto: false });
check('a page appends its rows and keeps the cursor', s.rows.length === 3 && s.cursor.url === 'u' && s.loading === null);
check('a page that carries its values marks them loaded, and the rest stay pending', (() => {
    const withValues = St.reduce(St.initialState, { type: 'pageLoaded', page: { rows, details: { [rows[0].id]: Df.diffDetail(detailOf(1)) }, next: null, total: 3 }, auto: false });
    return withValues.details[rows[0].id].status === 'loaded' && St.pendingDetails(withValues).length === 2;
})());
s = St.reduce(St.reduce(s, { type: 'pageRequested' }), { type: 'pageLoaded', page: { rows: [rows[2], Rw.toRow(audits[3])], next: null, total: 26 }, auto: true });
check('a second page dedupes by id, counts an automatic page, and takes the total', s.rows.length === 4 && s.autoPages === 1 && s.total === 26 && s.cursor === null);
check('the later request was "more"', St.reduce(s, { type: 'pageRequested' }).loading === 'more');
check('pendingDetails lists every row without values', St.pendingDetails(s).length === 4);
s = St.reduce(s, { type: 'detailRequested', ids: St.pendingDetails(s) });
check('requested details are loading and no longer pending', St.pendingDetails(s).length === 0 && s.details[rows[0].id].status === 'loading');
s = St.reduce(s, { type: 'detailLoaded', id: rows[0].id, detail: Df.diffDetail(detailOf(1)) });
s = St.reduce(s, { type: 'detailLoaded', id: rows[1].id, detail: Df.diffDetail(detailOf(2)) });
s = St.reduce(s, { type: 'detailFailed', id: rows[2].id, fault: { message: 'no', privilege: true } });
check('columnsSeen is every loaded column, first seen first', St.columnsSeen(s).join() === 'name,parentaccountid');
check('no scope shows every row', St.visibleRows(s, null).length === 4);
check(
    'a scope hides rows still loading, keeps a failed one, and filters loaded ones by column',
    St.visibleRows(s, 'parentaccountid').map((r) => r.id).join() === [rows[1].id, rows[2].id].join(),
    JSON.stringify(St.visibleRows(s, 'parentaccountid').map((r) => r.id)),
);
check('detailsSettled waits for the last one', St.detailsSettled(s) === false && St.detailsSettled(St.reduce(s, { type: 'detailLoaded', id: audits[3].auditid, detail: Df.diffDetail(detailOf(4)) })) === true);
const settled = St.reduce(s, { type: 'detailLoaded', id: audits[3].auditid, detail: Df.diffDetail(detailOf(4)) });
check('needsAutoContinue: nothing visible, a cursor, settled → yes; no cursor → no', (() => {
    // A failed detail is always visible, so the failed row is given values first.
    const allLoaded = { ...settled, details: { ...settled.details, [rows[2].id]: { status: 'loaded', detail: Df.diffDetail(detailOf(1)) } } };
    const withCursor = { ...allLoaded, cursor: { kind: 'nextLink', url: 'u' } };
    return St.needsAutoContinue(withCursor, 'websiteurl') === true
        && St.needsAutoContinue(allLoaded, 'websiteurl') === false
        && St.needsAutoContinue({ ...withCursor, details: settled.details }, 'websiteurl') === false
        && St.needsAutoContinue(withCursor, null) === false
        && St.needsAutoContinue({ ...withCursor, autoPages: 5 }, 'websiteurl') === false
        && St.needsAutoContinue(withCursor, 'name') === false;
})());
s = St.reduce(s, { type: 'toggle', id: rows[0].id });
check('toggle opens, and again closes', s.expanded[rows[0].id] === true && St.reduce(s, { type: 'toggle', id: rows[0].id }).expanded[rows[0].id] === undefined);
check('setFilter resets the automatic page count', St.reduce({ ...s, autoPages: 3 }, { type: 'setFilter', column: 'name' }).autoPages === 0);
check('a failed first page keeps the fault', St.reduce(St.initialState, { type: 'pageFailed', fault: { message: 'm', privilege: false } }).error.message === 'm');
check('reset is the initial state', St.reduce(s, { type: 'reset' }) === St.initialState);

/* -------------------------------------------------------- the empty state */

const on = { org: true, table: true };
check('a privilege refusal before anything else', Em.resolveEmpty({ outcome: 'privilege', rowCount: 0, visibleCount: 0, scoped: false, enabled: { org: false, table: false } }) === 'no-privilege');
check('an error before the switches', Em.resolveEmpty({ outcome: 'error', rowCount: 0, visibleCount: 0, scoped: false, enabled: { org: false, table: false } }) === 'error');
check('the organisation before the table', Em.resolveEmpty({ outcome: 'ok', rowCount: 0, visibleCount: 0, scoped: false, enabled: { org: false, table: false } }) === 'audit-off-org');
check('the table before "no changes"', Em.resolveEmpty({ outcome: 'ok', rowCount: 0, visibleCount: 0, scoped: false, enabled: { org: true, table: false } }) === 'audit-off-table');
check('an unknown switch is "no changes", never a guess', Em.resolveEmpty({ outcome: 'ok', rowCount: 0, visibleCount: 0, scoped: false, enabled: { org: null, table: null } }) === 'no-changes');
check('rows exist but the scope hides them: the column sentence, not the switch', Em.resolveEmpty({ outcome: 'ok', rowCount: 5, visibleCount: 0, scoped: true, enabled: { org: false, table: false } }) === 'no-changes-for-column');
check('anything visible is not empty', Em.resolveEmpty({ outcome: 'ok', rowCount: 5, visibleCount: 1, scoped: true, enabled: on }) === null);

/* --------------------------------------------------------------- the sample */

const sampleDoc = {
    table: 'account', column: 'name', auditing: { org: true, table: false }, labels: { name: 'Account Name' },
    changes: [
        { id: 'S1', when: '2026-09-18T14:05:00Z', who: 'Alex Chen', action: 2, changes: [{ column: 'name', old: 'A', new: 'B' }, { column: 'BAD COLUMN', old: 1, new: 2 }] },
        { id: 's1', when: '…', who: 'dup', action: 2, changes: [] },
        { when: '2026-09-17T10:00:00Z', who: 'Priya Raman', action: 14, share: { principal: 'Alex Chen', old: 'None', new: 'ReadAccess' } },
        { id: 's3', when: '2026-09-16T10:00:00Z', action: 1, changes: [{ column: 'name', new: 'A' }] },
    ],
};
const sample = Sp.parseSampleData(JSON.stringify(sampleDoc));
check('a blank sample is undefined and a bad one is null', Sp.parseSampleData('') === undefined && Sp.parseSampleData('  ') === undefined && Sp.parseSampleData('{nope') === null && Sp.parseSampleData('{"changes":1}') === null);
check(
    'the sample yields rows and details, ids lower-cased and deduped, a missing id generated',
    sample.rows.length === 3 && sample.rows[0].id === 's1' && sample.rows[1].id === 'sample-3' && sample.rows[2].id === 's3' && sample.rows[0].who === 'Alex Chen',
    JSON.stringify(sample.rows.map((r) => r.id)),
);
check('a bad column name in the sample is dropped, a good one kept', sample.details.s1.changes.length === 1 && sample.details.s1.changes[0].kind === 'changed');
check('the sample carries the auditing switches, the column and the labels', sample.auditing.table === false && sample.column === 'name' && sample.labels.name === 'Account Name');
check('a share in the sample is a share', sample.details['sample-3'].kind === 'share' && sample.details['sample-3'].principal === 'Alex Chen');
check('a set in the sample is a set', sample.details.s3.changes[0].kind === 'set');
check('the sample is capped', Sp.parseSampleData(JSON.stringify({ changes: Array.from({ length: 600 }, (_, i) => ({ id: `r${i}`, action: 2 })) })).rows.length === Sp.SAMPLE_MAX);

/* ------------------------------------------------------------- the platform */

const ctxWith = (options) => host.createContext({ getString: marked, fixture, ...options });
check('the record comes from contextInfo, bare and lower-case', (() => {
    const r = P.resolveRecord(ctxWith({ contextInfo: RECORD }));
    return r.recordId === G1 && r.table === 'account';
})());
check('without contextInfo the two inputs stand in, validated', (() => {
    const good = P.resolveRecord(ctxWith({ inputs: { recordId: `{${G1.toUpperCase()}}`, recordEntity: ' Account ' } }));
    const badId = P.resolveRecord(ctxWith({ inputs: { recordId: 'not-a-guid', recordEntity: 'account' } }));
    const badTable = P.resolveRecord(ctxWith({ inputs: { recordId: G1, recordEntity: 'Account Name' } }));
    return good.recordId === G1 && good.table === 'account' && badId.recordId === null && badId.table === 'account' && badTable.recordId === null;
})());
check('contextInfo wins over the inputs', P.resolveRecord(ctxWith({ contextInfo: RECORD, inputs: { recordId: 'ffffffff-0000-0000-0000-000000000000', recordEntity: 'contact' } })).recordId === G1);
check('the bound column is read off attributes.LogicalName, or is empty on canvas', P.resolveBoundColumn({ attributes: { LogicalName: 'Name' } }) === 'name' && P.resolveBoundColumn({}) === '');
check('the client URL comes from page.getClientUrl, and is null without it', (() => {
    const url = host.nextClientUrl();
    return P.lookupClientUrl(ctxWith({ clientUrl: url })) === url && P.lookupClientUrl(ctxWith({ page: false })) === null;
})());
const reading = P.readHost(ctxWith({ contextInfo: RECORD, inputs: { columnScope: true, pageSize: 7, sampleData: '' } }));
check('readHost folds everything the control reads', reading.webAPI !== null && reading.table === 'account' && reading.recordId === G1 && reading.column === 'name' && reading.columnScope === true && reading.pageSize === 7 && reading.sampleData === '' && reading.readable === true && typeof reading.columnLabels === 'function');
check('readHost withholds what the host withholds', (() => {
    const bare = P.readHost(ctxWith({ webAPI: false, utils: false, security: 'no-access', host: 'canvas' }));
    return bare.webAPI === null && bare.columnLabels === null && bare.readable === false && bare.column === '';
})());

/* ---- the fetch helper and the sources, against the rig (asynchronous) ---- */

async function sources() {
    const url = host.nextClientUrl();
    const ctx = ctxWith({ clientUrl: url, contextInfo: RECORD });

    const plain = await P.fetchJson(url, Qy.detailsPath(audits[1].auditid), true);
    check('fetchJson resolves on a 200 with the body', plain.ok === true && plain.status === 200 && plain.body.AuditDetail !== undefined);
    const missing = await P.fetchJson(url, Qy.detailsPath('00000000-0000-0000-0000-0000000000ff'), false);
    check('fetchJson resolves on a 404 too — a refusal is an answer, not an exception', missing.ok === false && missing.status === 404 && missing.body.error !== undefined);
    let offline = 'resolved';
    await P.fetchJson(`${host.nextClientUrl()}`, 'x', false).catch((e) => { offline = e.constructor.name; });
    check('and rejects only when there is no response', offline === 'Error' || offline === 'TypeError', offline);

    check('tableAuditEnabled reads the managed property\'s Value', await P.tableAuditEnabled(url, 'account') === true);
    const offUrl = host.nextClientUrl();
    ctxWith({ clientUrl: offUrl, auditEnabled: { org: false, table: false } });
    check('… and follows the switch', await P.tableAuditEnabled(offUrl, 'account') === false);
    check('… and is null for a table the organisation does not have', await P.tableAuditEnabled(url, 'nosuchtable') === null);
    check('orgAuditEnabled reads isauditenabled off the organisation row', await P.orgAuditEnabled(ctx.webAPI) === true);
    check('… and is null when the query is refused', await P.orgAuditEnabled({ retrieveMultipleRecords: () => Promise.reject({ message: 'no' }) }) === null);

    const labels = await P.readHost(ctx).columnLabels('account', ['name', 'parentaccountid', 'nosuchcolumn']);
    check('columnLabels reads DisplayName by name off the item collection and leaves an unknown column out', labels.name === 'Account Name' && labels.parentaccountid === 'Parent Account' && labels.nosuchcolumn === undefined, JSON.stringify(labels));

    const options = { webAPI: ctx.webAPI, clientUrl: url, entitySet: 'accounts', recordId: 'c1', table: 'account', pageSize: 10, column: null };
    const live = Ds.createLiveSource(options);
    const page1 = await live.loadPage(null);
    check(
        'the live source is the record-history function: one call, ten rows with their values, the total, a page cursor',
        live.route === 'history' && page1.rows.length === 10 && page1.rows[0].id === audits[0].auditid && page1.rows[0].who === 'Alex Chen'
            && Object.keys(page1.details).length === 10 && page1.details[audits[1].auditid].changes[0].column === 'parentaccountid'
            && page1.total === 26 && page1.next && page1.next.kind === 'page' && page1.next.pageNumber === 2 && typeof page1.next.cookie === 'string',
        JSON.stringify([live.route, page1.rows.length, page1.total, page1.next]),
    );
    const page2 = await live.loadPage(page1.next);
    const page3 = await live.loadPage(page2.next);
    check('… and pages by number and cookie to the end', page2.rows[0].id === audits[10].auditid && page3.rows.length === 6 && page3.next === null && page3.total === 26);
    const scoped = Ds.createLiveSource({ ...options, column: 'name' });
    const scopedPage = await scoped.loadPage(null);
    check('Only this column asks the attribute-history function: three name changes, server-side', scopedPage.rows.length === 3 && scopedPage.total === 3 && Object.values(scopedPage.details).every((d) => d.changes.some((c) => c.column === 'name')), JSON.stringify(scopedPage.rows.map((r) => r.id)));
    const detail = await live.loadDetail(audits[1].auditid);
    check('a row without values can still be asked for through the bound function', detail.kind === 'attributes' && detail.changes[0].column === 'parentaccountid');
    let fault = null;
    await live.loadDetail('00000000-0000-0000-0000-0000000000ff').catch((e) => { fault = e; });
    check('a missing row is a fault with the server\'s sentence, not a privilege one', fault && fault.privilege === false && /Does Not Exist/.test(fault.message), JSON.stringify(fault));
    check('probeEnabled asks both switches', JSON.stringify(await live.probeEnabled()) === '{"org":true,"table":true}');
    check('readHistoryPage reads an empty collection as an empty page', (() => { const p = Ds.readHistoryPage({ AuditDetailCollection: { MoreRecords: false, TotalRecordCount: 0, AuditDetails: [] } }, 1); return p.rows.length === 0 && p.next === null && p.total === 0; })());

    const noUrl = Ds.createLiveSource({ ...options, clientUrl: null, entitySet: null });
    const noUrlPage = await noUrl.loadPage(null);
    fault = null;
    await noUrl.loadDetail(audits[1].auditid).catch((e) => { fault = e; });
    check('without an organisation URL the table route answers: every row read once, sliced, the values a named fault', noUrl.route === 'audits' && noUrlPage.rows.length === 10 && noUrlPage.total === 26 && noUrlPage.next.kind === 'offset' && (await noUrl.loadPage(noUrlPage.next)).rows[0].id === audits[10].auditid && fault && fault.privilege === false);
    check('… and the table switch is unknown rather than off', (await noUrl.probeEnabled()).table === null);
    check('without an entity set the functions cannot be addressed, so the table answers', Ds.createLiveSource({ ...options, entitySet: null }).route === 'audits');
    check('with neither route there is no source', Ds.createLiveSource({ ...options, webAPI: null, clientUrl: null, entitySet: null }) === null);

    const refusedUrl = host.nextClientUrl();
    const refusedCtx = ctxWith({ clientUrl: refusedUrl, auditStatus: 403 });
    const refused = Ds.createLiveSource({ ...options, webAPI: refusedCtx.webAPI, clientUrl: refusedUrl });
    const fallback = await refused.loadPage(null);
    fault = null;
    await refused.loadDetail(audits[1].auditid).catch((e) => { fault = e; });
    check(
        'a user without prvReadRecordAuditHistory: the function is refused, the table answers the rows, and the values are refused without asking',
        refused.route === 'audits' && fallback.rows.length === 10 && fallback.details === undefined && fault && fault.privilege === true,
        JSON.stringify([refused.route, fallback.rows.length, fault]),
    );
    const bothUrl = host.nextClientUrl();
    const bothCtx = ctxWith({ clientUrl: bothUrl, auditStatus: 403, auditSummary: false });
    const both = Ds.createLiveSource({ ...options, webAPI: bothCtx.webAPI, clientUrl: bothUrl });
    fault = null;
    await both.loadPage(null).catch((e) => { fault = e; });
    check('a user without either privilege: the page is a privilege fault', fault && fault.privilege === true, JSON.stringify(fault));

    const darkUrl = host.nextClientUrl();
    const darkCtx = ctxWith({ clientUrl: darkUrl, auditStatus: 0 });
    const dark = Ds.createLiveSource({ ...options, webAPI: darkCtx.webAPI, clientUrl: darkUrl });
    fault = null;
    await dark.loadPage(null).catch((e) => { fault = e; });
    check('offline: the page is a plain fault, not a privilege one, and the table is not tried', fault && fault.privilege === false && dark.route === 'history', JSON.stringify(fault));

    const sampled = Ds.createSampleSource(sample, 2);
    const s1 = await sampled.loadPage(null);
    const s2 = await sampled.loadPage(s1.next);
    check('the sample source pages the sample, knows its total, and carries the values', s1.rows.length === 2 && s1.total === 3 && Object.keys(s1.details).length === 2 && s2.rows.length === 1 && s2.next === null);
    check('… and answers values and the switches from the document', (await sampled.loadDetail('s1')).kind === 'attributes' && (await sampled.probeEnabled()).table === false);
    check('the sample source scopes to a column the way the attribute function would', (await Ds.createSampleSource(sample, 10, 'name').loadPage(null)).rows.length === 2);

    check('isPrivilegeFault reads the code or the message', Ds.isPrivilegeFault({ errorCode: 2147746336, message: 'x' }) && Ds.isPrivilegeFault({ message: 'Principal user is missing prvReadAuditSummary privilege.' }) && !Ds.isPrivilegeFault({ message: 'Record Is Unavailable.' }));
}

/* --------------------------------------------- the bundle: the mode ladder */

const bound = mount({ contextInfo: RECORD });
check('a saved record with a Web API is live, keyed on the record', bound.props().mode === 'live' && bound.props().sourceKey.startsWith(`live|account|${G1}|`), bound.props().sourceKey);
check('the scope is off unless columnScope is on', bound.props().scope === null && bound.update({ inputs: { columnScope: true } }).props.scope === 'name');
check('the key carries the scope and the page size, so a preset switch restarts the list', (() => {
    const a = bound.update({ inputs: { pageSize: 5 } }).props.sourceKey;
    const b = bound.update({ inputs: { pageSize: 5, columnScope: true } }).props.sourceKey;
    return a.includes('||5|') && b.includes('|name|5|') && a !== b;
})());
check('the same key resolves to the same source', bound.update({}).props.resolve === bound.update({}).props.resolve && bound.update({}).props.resolve !== bound.update({ inputs: { pageSize: 3 } }).props.resolve);
check('the identity inputs stand in for contextInfo', mount({ inputs: { recordId: G1, recordEntity: 'account' } }).props().mode === 'live');
check('an unsaved record — no identity anywhere — is save-first', mount({}).props().mode === 'save-first' && mount({ inputs: { recordId: 'nope', recordEntity: 'account' } }).props().mode === 'save-first');
check('no Web API and no organisation URL is not-available, before save-first; either alone is a route', mount({ webAPI: false, page: false }).props().mode === 'not-available' && mount({ webAPI: false, page: false, contextInfo: RECORD }).props().mode === 'not-available' && mount({ webAPI: false, contextInfo: RECORD }).props().mode === 'live' && mount({ page: false, contextInfo: RECORD }).props().mode === 'live');
check('a column the user cannot read is no-access, before anything else', mount({ contextInfo: RECORD, security: 'no-access' }).props().mode === 'no-access');
const sampleJson = JSON.stringify(sampleDoc);
const sampledMount = mount({ webAPI: false, inputs: { sampleData: sampleJson } });
check('sample data is its own mode, whatever the host has', sampledMount.props().mode === 'sample' && sampledMount.props().sourceKey.startsWith('sample|'));
check('unreadable sample data is its own state', mount({ inputs: { sampleData: '{not json' } }).props().mode === 'bad-sample');
check('the sample route honours the scope too, and names the column from the sample', (() => {
    const scoped = mount({ webAPI: false, host: 'canvas', inputs: { sampleData: sampleJson, columnScope: true } }).props();
    return scoped.scope === 'name' && scoped.columnLabel === 'Account Name' && scoped.sampleLabels.name === 'Account Name';
})());
check('readLabels is null without the Utility feature', mount({ contextInfo: RECORD, utils: false }).props().readLabels === null && typeof bound.props().readLabels === 'function');
check('every sentence comes from the .resx', (() => {
    const strings = bound.props().strings;
    return Object.values(strings).every((v) => typeof v === 'string' && v.startsWith('resx:AuditHistory_')) && Object.keys(strings).length === 37;
})(), String(Object.keys(bound.props().strings).length));
check('theme and direction are handed down', mount({ contextInfo: RECORD, rtl: true, dark: true }).props().isRTL === true && mount({ contextInfo: RECORD, dark: true }).props().dark === true);
check('the control writes nothing', JSON.stringify(bound.outputs()) === '{}');

/* -------------------------------------------- the bundle: the markup */

const html = (options) => renderDeep(mount(options).element) || '';
check('each mode renders its sentence from the .resx', html({ webAPI: false, page: false }).includes('resx:AuditHistory_NotAvailable') && html({}).includes('resx:AuditHistory_SaveFirst') && html({ contextInfo: RECORD, security: 'no-access' }).includes('resx:AuditHistory_NoAccess') && html({ inputs: { sampleData: '{' } }).includes('role="alert"'));
check('a live mount shows the spinner before anything is known — never "no changes"', (() => {
    const markup = html({ contextInfo: RECORD });
    return markup.includes('resx:AuditHistory_Loading') && !markup.includes('resx:AuditHistory_NoChanges');
})());
check('hidden is nothing', renderDeep(mount({ contextInfo: RECORD, visible: false }).element) === '');
check('dark and narrow are classes on the root', html({ contextInfo: RECORD, dark: true }).includes('AuditHistory--dark') && html({ contextInfo: RECORD, width: 300 }).includes('AuditHistory--narrow') && !html({ contextInfo: RECORD, width: 800 }).includes('AuditHistory--narrow'));

const rowStrings = bound.props().strings;
const rowHtml = (detail, expanded) => renderDeep(React.createElement(Cm.ChangeRow, {
    row: Rw.toRow(audits[3]), detail, expanded, labelOf: (c) => `L:${c}`, strings: rowStrings, getString: marked, onToggle: () => undefined,
}));
const closedRow = rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(4)) }, false);
check('a closed row: a button with aria-expanded, when, who, the action and the columns', closedRow.includes('aria-expanded="false"') && closedRow.includes('9/18/2026') && closedRow.includes('Alex Chen') && closedRow.includes('>Update<') && closedRow.includes('L:industrycode') && !closedRow.includes('AuditHistory-table'), closedRow);
const openRow = rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(4)) }, true);
check('an open row: the values table, old beside new, headers from the .resx', openRow.includes('aria-expanded="true"') && openRow.includes('AuditHistory-table') && openRow.includes('>Accounting<') && openRow.includes('>Business Services<') && openRow.includes('resx:AuditHistory_From'));
check('a cleared column says so in the new cell', rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(3)) }, true).includes('resx:AuditHistory_Cleared'));
check('a capped value carries the note', rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(5)) }, true).includes('resx:AuditHistory_Truncated'));
check('a share renders its facts, not an empty table', (() => { const m = rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(8)) }, true); return m.includes('AuditHistory-facts') && !m.includes('AuditHistory-table'); })());
check('values still loading show the spinner; failed ones the sentence; a privilege failure the other sentence', rowHtml({ status: 'loading' }, true).includes('resx:AuditHistory_Loading') && rowHtml({ status: 'failed', message: 'x', privilege: false }, true).includes('resx:AuditHistory_DetailFailed') && rowHtml({ status: 'failed', message: 'x', privilege: true }, true).includes('resx:AuditHistory_NoPrivilege'));
check('a row with no user names one', rowHtml({ status: 'loaded', detail: Df.diffDetail(detailOf(4)) }, false).includes('Alex Chen') && renderDeep(React.createElement(Cm.ChangeRow, { row: { ...Rw.toRow(audits[3]), who: '' }, detail: undefined, expanded: false, labelOf: (c) => c, strings: rowStrings, getString: marked, onToggle: () => undefined })).includes('resx:AuditHistory_UnknownUser'));
check('fill replaces both placeholders', Cm.fill('{0} of {1}', 3, 26) === '3 of 26' && Cm.fill('Only {0}', 'x') === 'Only x');

/* ------------------------------------------------------------- teardown */

/*
 * The control takes no timers and no document listeners, so both numbers are
 * zero and this passes trivially — which is the point: it starts passing for
 * a real reason the moment somebody adds one, and fails the moment they
 * forget the other half.
 */
disposeAll();

const timersBefore = time.pending();
const listenersBefore = Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0);

const disposable = mount({ contextInfo: RECORD });

disposable.destroy();

check('destroy() releases every timer the control took', time.pending() === timersBefore, `${timersBefore} → ${time.pending()}`);
check(
    'and every document-level listener',
    Object.values(dom.document.listeners).reduce((total, list) => total + list.length, 0) === listenersBefore,
);

const rerendered = mount({ contextInfo: RECORD });
const afterFirst = time.pending();

rerendered.update({});
rerendered.update({});

check('and re-rendering does not add another one', time.pending() === afterFirst);

disposeAll();

/* ======================================================================== *
 *  THE RIG'S OWN CLAIMS — keep these. They are about `dev/host.js`, not about
 *  the control, and they exist because a rig that silently answers the wrong
 *  host's question certifies whatever it is handed. Each one was a real bug in
 *  a sibling repository's rig before it was an assertion here.
 * ======================================================================== */

async function rigSelfCheck() {
    const relationships = (url) => `${url}/api/data/v9.2/EntityDefinitions(LogicalName='account')/OneToManyRelationships`;

    /*
     * Two hosts, two answers. The fetch stub is one global routed by origin,
     * and before it was, the stub belonged to whichever host a suite created
     * last — so a second mount's refusal became every mount's refusal.
     */
    const open = mount({});
    const refused = mount({ relationshipsStatus: 403 });
    const [a, b] = await Promise.all([fetch(relationships(open.clientUrl)), fetch(relationships(refused.clientUrl))]);

    check('rig: each host answers its own metadata fetch', a.status === 200 && b.status === 403, `${a.status} / ${b.status}`);
    check(
        "rig: a fresh host does not inherit an earlier host's answers",
        (await a.json()).value.some((row) => row.ReferencingAttribute === 'parentaccountid' && row.IsHierarchical === true),
    );

    let foreign = 'resolved';
    await fetch('https://nowhere.invalid/api/data/v9.2/x').catch((error) => { foreign = error.constructor.name; });
    // Whatever `fetch` was there before answers — Node's own, here, which cannot
    // resolve the name — and the claim is only that the rig did not answer it.
    check("rig: a URL on no host's origin is refused, not answered", foreign !== 'resolved', foreign);

    const ctx = host.createContext({ fixture, clientUrl: host.nextClientUrl() });
    const xml = "<fetch><entity name='account'><attribute name='accountid'/><attribute name='name'/><attribute name='accountid' rowaggregate='CountChildren' alias='children'/><filter><condition attribute='accountid' operator='eq-or-above' value='c1'/></filter></entity></fetch>";
    const chain = await ctx.webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`);

    check(
        'rig: eq-or-above answers the record and every ancestor, with child counts',
        chain.entities.map((row) => `${row.accountid}:${row.children}`).sort().join(',') === 'c1:2,p1:2,r1:2',
        JSON.stringify(chain.entities.map((row) => [row.accountid, row.children])),
    );

    let fault = null;
    await host.createContext({ fixture, clientUrl: host.nextClientUrl(), hierarchical: false })
        .webAPI.retrieveMultipleRecords('account', `?fetchXml=${encodeURIComponent(xml)}`)
        .catch((error) => { fault = error; });
    check(
        'rig: a hierarchical operator on a table that is not hierarchical is refused as a plain object',
        fault !== null && !(fault instanceof Error) && typeof fault.errorCode === 'number' && typeof fault.message === 'string',
        fault && fault.constructor.name,
    );

    const page = await ctx.webAPI.retrieveMultipleRecords('account', "?$select=accountid,name&$filter=_parentaccountid_value eq c1&$orderby=name asc", 1);
    check('rig: maxPageSize truncates and says there is more', page.entities.length === 1 && typeof page.nextLink === 'string', JSON.stringify(page));

    /*
     * The audit half: rows through `webAPI`, values through the two functions
     * on the fetch stub. The `nextLink` has to carry the query, because a
     * control hands it straight back — before it did, page two of a filtered
     * list answered an unfiltered one.
     */
    const auditQuery = '?$select=auditid,createdon,action,_objectid_value&$filter=_objectid_value eq c1&$orderby=createdon desc';
    const first = await ctx.webAPI.retrieveMultipleRecords('audit', auditQuery, 10);
    check(
        'rig: the audit table ignores maxPageSize — every row, newest first, nextLink an empty string (measured)',
        first.entities.length === 26 && first.nextLink === '' && first.entities[0].createdon > first.entities[25].createdon
            && first.entities.every((row) => row._objectid_value === 'c1'),
        `${first.entities.length} ${JSON.stringify(first.nextLink)}`,
    );
    const paged = await ctx.webAPI.retrieveMultipleRecords('account', '?$select=accountid,name&$filter=_parentaccountid_value eq r1&$orderby=name asc', 1);
    const next = await ctx.webAPI.retrieveMultipleRecords('account', paged.nextLink, 1);
    check(
        'rig: any other table pages by a nextLink that carries the filter and the order',
        paged.entities.length === 1 && next.entities.length === 1 && paged.entities[0].accountid === 'o1' && next.entities[0].accountid === 'p1',
        JSON.stringify([paged.entities, next.entities]),
    );

    const api = `${ctx.page.getClientUrl()}/api/data/v9.2`;
    const detail = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`, { headers: { Prefer: 'odata.include-annotations="*"' } }).then((r) => r.json());
    const plain = await fetch(`${api}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`).then((r) => r.json());
    check(
        'rig: RetrieveAuditDetails answers by audit id with the AuditRecord — who, when, action — annotated only under Prefer',
        detail.AuditDetail['@odata.type'] === '#Microsoft.Dynamics.CRM.AttributeAuditDetail'
            && detail.AuditDetail.NewValue['_parentaccountid_value@Microsoft.Dynamics.CRM.lookuplogicalname'] === 'account'
            && detail.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && detail.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === 'Priya Raman'
            && plain.AuditDetail.AuditRecord.auditid === first.entities[1].auditid
            && plain.AuditDetail.AuditRecord['_userid_value@OData.Community.Display.V1.FormattedValue'] === undefined,
        JSON.stringify(Object.keys(detail.AuditDetail)),
    );
    const unknown = await fetch(`${api}/audits(00000000-0000-0000-0000-0000000000ff)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    check('rig: an audit id the fixture does not hold is a 404', unknown.status === 404, String(unknown.status));

    const target = encodeURIComponent("{'@odata.id':'accounts(c1)'}");
    const paging = encodeURIComponent(JSON.stringify({ PageNumber: 2, Count: 10, ReturnTotalRecordCount: true }));
    const history = await fetch(`${api}/RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)?@t=${target}&@p=${paging}`).then((r) => r.json());
    check(
        'rig: RetrieveRecordChangeHistory pages by @p, counts the whole history, and every detail carries its AuditRecord',
        history.AuditDetailCollection.AuditDetails.length === 10 && history.AuditDetailCollection.TotalRecordCount === 26
            && history.AuditDetailCollection.MoreRecords === true
            && history.AuditDetailCollection.AuditDetails.every((d) => typeof d.AuditRecord?.auditid === 'string')
            && history.AuditDetailCollection.AuditDetails[0].AuditRecord.auditid === first.entities[10].auditid,
        JSON.stringify([history.AuditDetailCollection.AuditDetails.length, history.AuditDetailCollection.TotalRecordCount]),
    );

    const definition = await fetch(`${api}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const off = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditEnabled: { org: false, table: false }, auditStatus: 403, auditSummary: false });
    const offApi = `${off.page.getClientUrl()}/api/data/v9.2`;
    const offDefinition = await fetch(`${offApi}/EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled`).then((r) => r.json());
    const offOrg = await off.webAPI.retrieveMultipleRecords('organization', '?$select=isauditenabled&$top=1');
    check(
        'rig: IsAuditEnabled is a managed property that follows the switch, on the table and the organisation',
        definition.IsAuditEnabled.Value === true && offDefinition.IsAuditEnabled.Value === false && offOrg.entities[0].isauditenabled === false,
        JSON.stringify([definition.IsAuditEnabled, offDefinition.IsAuditEnabled, offOrg.entities[0]]),
    );

    const refusedDetail = await fetch(`${offApi}/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`);
    let summaryFault = null;
    await off.webAPI.retrieveMultipleRecords('audit', auditQuery, 10).catch((error) => { summaryFault = error; });
    check(
        'rig: the two audit privileges refuse separately — a 403 body on the function, a plain-object fault on the query',
        refusedDetail.status === 403 && summaryFault !== null && !(summaryFault instanceof Error) && typeof summaryFault.errorCode === 'number',
        `${refusedDetail.status} / ${summaryFault && summaryFault.constructor.name}`,
    );

    let offline = 'resolved';
    const dark = host.createContext({ fixture, clientUrl: host.nextClientUrl(), auditStatus: 0 });
    await fetch(`${dark.page.getClientUrl()}/api/data/v9.2/audits(${first.entities[1].auditid})/Microsoft.Dynamics.CRM.RetrieveAuditDetails`)
        .catch((error) => { offline = error.constructor.name; });
    check('rig: auditStatus 0 is the offline shape, a TypeError', offline === 'TypeError', offline);

    const metadata = await ctx.utils.getEntityMetadata('account', ['name', 'revenue', 'nosuchcolumn']);
    check(
        'rig: getEntityMetadata(table, columns).Attributes is an item collection of the columns asked for that the fixture names',
        metadata.Attributes.get('name').DisplayName === 'Account Name' && metadata.Attributes.getAll().length === 2 && metadata.Attributes.get('nosuchcolumn') === undefined,
        JSON.stringify(metadata.Attributes.getAll()),
    );

    disposeAll();
}

sources().then(rigSelfCheck).then(report, (error) => {
    check('the asynchronous half ran to the end', false, String(error && error.stack || error));
    report();
});

function report() {
    const failed = results.filter((result) => !result.ok);

    for (const result of results) {
        const detail = result.detail ? `  — ${result.detail}` : '';

        console.log(`  ${result.ok ? 'ok  ' : 'FAIL'}  ${result.label}${detail}`);
    }

    console.log(
        failed.length > 0
            ? `\n  ${failed.length} of ${results.length} failed\n`
            : `\n  ${results.length} passed — the control's own decisions only; see SPEC.md for what a real form still has to confirm\n`,
    );

    process.exit(failed.length > 0 ? 1 : 0);
}
