# Audit History

A record's audit history on the form: who changed what, when, and the old value beside the new.

Bound to **any** column — it never reads or writes the value; the binding is a
place on the form plus, through `attributes.LogicalName`, an optional *Only
this column* scope. The record's own identity comes from
`mode.contextInfo` (`entityId`, `entityTypeName`), with the `recordId` /
`recordEntity` inputs as the documented fallback. Read-only in 0.1.0: no
restore, no edit, no delete.

## Measured — the 0.0.1 and 0.0.2 probes

The 0.0.x builds are probes: `AuditHistory/probe.tsx` (in git at `e612f99`
and `cb9e316`, deleted since) asks the form the questions below and prints
the answers into the control. Every design decision under *Where the rows
come from* rests on one of them — and the second run **reversed the first
design**: the build assumed Learn's statement that the Web API returns no
`AuditRecord` and read the rows from the audit table with one request per
row for the values; the form showed `AuditRecord` on every detail, so the
history is one function call per page.

**Environment:** the Accounts form on `cll365` (`https://cll365.crm.dynamics.com`),
2026-09-18, the control bound to *Address 2: Street 1* (`address2_line1`) on
*City Power & Light (sample)*. Run 1 with one audited change on the record
(*Parent Account* set); run 2 after fifteen — name, phone, credit limit,
address lines, latitude and longitude — which is what P3, P9, P10 and P13–P15
needed.

| # | Question | Decides | Answer |
| --- | --- | --- | --- |
| P1 | What does `parameters.value` look like on an `of-type-group` binding to `name` — `type`, `attributes.LogicalName` / `DisplayName`, `security`? And `mode.contextInfo`: `entityId` bare? `entityTypeName` present? | `resolveBoundColumn()`, `resolveRecord()`; whether the type group survives on a form or falls back to `SingleLine.Text` | Measured 2026-09-18 (run 1, bound to *Address 2: Street 1*): the type group is offered on any column and survives on the form — `attributes.LogicalName` = `address2_line1`, `DisplayName` = "Address 2: Street 1", `attributes.Type` = `string`, while **`parameter.type` said `Currency`**, a member of the group rather than the column's type, so a type-group binding's `type` is not to be read. `security` = `{ secured: false, editable: true, readable: true }`; `raw` = `null`. `mode.contextInfo` = `{ entityTypeName: "account", entityId: "83e84297-…", entityRecordName }` — bare, lower-case. `page.getClientUrl()` present, answering `https://cll365.crm.dynamics.com`. Unset inputs arrive `null`; `pageSize` as its default 20. |
| P2 | `webAPI.retrieveMultipleRecords('audit', '?$select=…&$filter=_objectid_value eq <id>&$orderby=createdon desc', 5)`: status, elapsed, the first row's keys — are `createdon@…FormattedValue`, `action@…FormattedValue`, `_userid_value@…FormattedValue` and `…lookuplogicalname` present without a `Prefer` header? Is `nextLink` set at page size 5? | `audit/rows.ts` reads formatted values or falls back; `audit/actions.ts` prefers the platform's label | Measured: `retrieveMultipleRecords('audit', …, 5)` answered in 110 ms with the formatted values **without** a `Prefer` header — `createdon@…FormattedValue` ("9/17/2026 8:25 PM", the user's zone), `action@…`, `operation@…`, `_userid_value@…FormattedValue` and `…lookuplogicalname` — plus `versionnumber` unasked. The result carries `nextLink` as **an empty string** when there is no next page, not `undefined`. |
| P3 | Does the PCF Web API follow its own `nextLink` when it is passed back as `options` — the full URL, or only its query part? Failing both, does a keyset filter `createdon lt <last>` page? | how the audit table is paged; the rig's modelling | **The audit table does not page at all.** Run 2: `retrieveMultipleRecords('audit', …, 5)` answered **15 rows for a page size of 5**, `nextLink` `""`. Cosmos-backed, and `maxPageSize` is ignored; there is no link to follow. The table route reads every row once and slices; the rig answers the same way. |
| P4 | A same-origin `fetch` of `audits(<id>)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`: status, elapsed, body keys; does `Prefer: odata.include-annotations="*"` add the formatted-value annotations? Then a whole page of 20 in parallel: total elapsed, any 429 | eager vs lazy `DETAIL_MODE`; whether the column filter is per page or per expanded row | Measured: 200 in 98 ms. **Without `Prefer` the values carry no annotations** (`_parentaccountid_value` alone); with `Prefer: odata.include-annotations="*"` the formatted value, `associatednavigationproperty` and `lookuplogicalname` arrive. Run 2, fifteen rows: the page in 317 ms and **fifteen details in parallel in 213 ms**, all 200 — which would have been fine, and is moot: **the detail carries `AuditRecord`** (P13), so no control needs one request per row. |
| P5 | The `AuditDetail` for an Update that set a lookup, cleared a text column and changed a choice: the exact `OldValue` / `NewValue` keys and annotations (`FormattedValue`, `lookuplogicalname`, `associatednavigationproperty`); is a cleared column absent from `NewValue` or present as `null`; what is in `DeletedAttributes` | `audit/diff.ts` — cleared vs absent, lookup key folding; the rig's fixture shapes | Measured on eight details. A lookup **set** is `OldValue: { @odata.type }` only and `NewValue` with the lookup and its three annotations. A column **set for the first time** (`address1_line3`) is on the new side only — so *cleared* is read as the mirror, present on the old side only, and stays *Not verified*. A **money** column arrives as its number with **no formatted value** (`creditlimit: 30` → `40`) beside its `creditlimit_base` shadow, which the differ folds; a decimal arrives formatted (`address1_latitude` "1.00000"); text arrives bare. Two columns in one save are two keys in one detail, and the composite address column rides along with its lines. `DeletedAttributes` was `{ Count: 0, Keys: [], Values: [] }` on all eight. The choice was not on the record. |
| P6 | The `AuditDetail` for the Create row (action 1) and, if the record was assigned or shared, for 13 / 14: `@odata.type` values; is Create's `OldValue` empty and how many keys does its `NewValue` carry | the non-attribute detail kinds; whether Create renders as *set* rows | Not measured: the sample record's Create predates auditing and it was neither assigned nor shared. What was measured instead: an **audit-configuration event** (action **107**, *Audit Enabled*, April) arrives as an `AttributeAuditDetail` with **no** `OldValue` and no `NewValue` — and `RetrieveAttributeChangeHistory` files it under the column (P10). The differ reads it as an attributes detail with no changes; the row shows the platform's action label and *No values are recorded*. |
| P7 | The refusal shapes: `retrieveMultipleRecords('audit', …)` and the details fetch for a user **without** `prvReadAuditSummary`; and the fetch of a bogus `audits(00000000-…)` id | `isPrivilegeFault()`, the rig's 403 body, the *no privilege* state | Measured for the bogus id: **404**, body `{ error: { code: "0x80048d02", message: "The HTTP status code of the response was not expected (404)… Could not find item…" } }` — the message wraps the inner response as text. The privilege refusal is still unmeasured (needs a second user). |
| P8 | `retrieveMultipleRecords('organization', '?$select=isauditenabled&$top=1')` and a fetch of `EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled,EntitySetName`: status, the `IsAuditEnabled` shape (`{ Value, CanBeChanged }`?), elapsed; and the bound column's own `IsAuditEnabled` | `probeEnabled()`; the rig's `auditEnabled` switch shape | Measured: `organization` through `retrieveMultipleRecords` in 211 ms — `isauditenabled: true` with a formatted "Yes", plus `isuseraccessauditenabled` and `auditretentionperiodv2` (30). `EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled,EntitySetName,PrimaryNameAttribute` 200 in 77 ms: `IsAuditEnabled` = `{ Value: true, CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyauditsettings" }`, `EntitySetName` = `accounts`. The column's own `IsAuditEnabled` reads the same shape off `…/Attributes(LogicalName='x')`. |
| P9 | Unbound `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)` with `@t={'@odata.id':'accounts(<id>)'}` and `@p={"PageNumber":1,"Count":5,"ReturnTotalRecordCount":true}`: status, `MoreRecords`, `TotalRecordCount`, `AuditDetails.length`; **is `AuditRecord` absent, as Learn says**; does its order match the `audits` query's first five, compared by the columns each detail touches | whether one call per page is viable; `TotalRecordCount` as the *Showing n of m* source | **The route.** Run 2: 200 in 385 ms, `MoreRecords` true, `TotalRecordCount` 16 (the 15 changes plus the April *Audit Enabled* event the audits query does not list), five details, a 746-character cookie. **Every detail carries `AuditRecord`** — Learn is wrong for this environment — and the five came in the **same order** as the audits query's first five (`same=true`). The URL shape with encoded `@`-aliases is accepted as written. |
| P10 | `RetrieveAttributeChangeHistory(Target=@t,AttributeLogicalName=@a,PagingInfo=@p)` for the bound column, from a form: status, `TotalRecordCount` | whether *Only this column* can get a true server-side total; otherwise the scope is client-side over the loaded pages | Measured: 200 in 104 ms, `TotalRecordCount` 1 for `address2_line1` — the column had never been edited, and the one row is the April **action 107** *Audit Enabled* event, filed under the column with no values. So the function is the server-side *Only this column* the control uses, **and** it lists audit-configuration events beside value changes; the control shows them for what they are. |
| P11 | `utils.getEntityMetadata('account', [columns]).Attributes` — an `ItemCollection` with `get()` / `getAll()`? Is `DisplayName` a string or a label object? elapsed | `columnLabels()`, and `EntitySetName` for the unbound functions' entity reference; whether `Utility` stays declared | Measured: `getEntityMetadata('account', [five columns])` in 1 ms; `Attributes` is an item collection with `get()` and `getAll()`; each item's **`DisplayName` is a string** ("Industry"), with `LogicalName`, `AttributeType` (11) and `AttributeTypeName` ("picklist") beside private `_…` fields. `getAll()` returned exactly the five asked for. The rig models this shape. |
| P12 | A Description change over 5 KB: does the value in the detail end with `…`, and at what length | `CAP_HINT` in `audit/diff.ts`; the *Cut at 5 KB* note | Not measured: no Description change was made. The flag rests on Learn's statement (5 KB, a trailing ellipsis) and stays under *Not verified*. |
| P13 | What `AuditRecord` holds on `RetrieveAuditDetails`, with and without `Prefer` | whether a function alone can draw the list | Measured: the full audit row — `auditid`, `createdon`, `action`, `operation`, `_userid_value`, `_objectid_value`, `objecttypecode`, `transactionid`, `versionnumber`, `attributemask`, `timetoliveinseconds` — and **the formatted values only under `Prefer: odata.include-annotations="*"`**: `createdon@…` "9/18/2026 2:51 PM", `action@…` "Update", `_userid_value@…FormattedValue` "Charles Llamas". So the header stays on every function call. |
| P14 | The same on every detail of `RetrieveRecordChangeHistory` | the one-call-per-page route | Measured: every detail's `AuditRecord` is the row, annotated — with `transactionid` zeroed and `versionnumber` 0 on this function (real on the bound one); neither is read. |
| P15 | Does `RetrieveRecordChangeHistory` page by `PageNumber` alone, and with the cookie | the cursor | Both: page 2 of 2 by `PageNumber` alone answered the next two ids; page 1 returned a 509-character `PagingCookie`; page 2 with that cookie answered the same two ids. The control sends the cookie when it has one, as Learn asks, and the number always. |

## Where the rows come from

**One request per page.** `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)`
— unbound, the record as `{'@odata.id':'accounts(<id>)'}`, `PagingInfo` as
`{ PageNumber, Count, ReturnTotalRecordCount, PagingCookie? }` — answers a
page of `AuditDetail`s, each carrying its `AuditRecord` (who, when, action,
annotated under `Prefer`) beside its old and new values, with
`TotalRecordCount` and `MoreRecords`. With *Only this column* on,
`RetrieveAttributeChangeHistory` does the same for one column, server-side.
Both are functions `context.webAPI` cannot call, so they are a same-origin
`fetch` of the organisation URL through the one helper in `platform.ts`.
Needs `prvReadRecordAuditHistory`, and the entity-set name — from
`utils.getEntityMetadata` (P11) or the `EntityDefinitions` read (P8), never
guessed.

Learn's *Retrieve the history of audited data changes* says the Web API's
`AuditDetail` types omit `AuditRecord`. Measured here they do not (P13,
P14), which is the whole design: the first build, written on Learn's word,
read the rows from the `audit` table and asked for each row's values
separately. That design survives as **the fallback**, taken once on the
first page when the function is refused for a privilege and
`context.webAPI` can still read the table (`prvReadAuditSummary` without
`prvReadRecordAuditHistory`): every row at once — the table ignores
`maxPageSize` (P3) — sliced by the control, values refused without asking.

The sample route is the same interface fed from `sampleData`, for the hub.

## What the build disagreed with

- **`parameter.type` on a type-group binding names a member of the group,
  not the column** — `Currency` on a text column (P1). The control reads
  `attributes.Type` when it needs a type, and here it needs none.
- **`nextLink` is `""`, not `undefined`, on a last page** (P2). Read as a
  string with content, never as presence.
- **The audit table ignores `maxPageSize`** (P3). The rig used to page it
  by `nextLink`; it answers every row now, the empty string beside them.
- **`Prefer` matters on a function and not on the query** (P2, P4, P13):
  `retrieveMultipleRecords` annotates without being asked; a fetched
  function does not.
- **A money column's values are unformatted and doubled** (P5): the number
  without a `FormattedValue`, and a `_base` shadow beside it. The differ
  folds the shadow; the number shows as a number, and the limitations page
  says so.
- **An audit-configuration event is an `AttributeAuditDetail` with no
  values** (P6, P10), filed under the column it configured.

## Demo

`demo.fidelity` is **mocked**: the control's whole content comes from a
same-origin function call and `context.webAPI`, neither of which the hub's
harness supplies, so every preset carries a JSON history in `sampleData`
and the sample route renders it. Everything that never leaves the browser is
real there; the two switches' sentences come from the preset's `auditing`.

## Not verified

- **The privilege refusal shape** (P7) — the function's 401/403 and the
  query's fault for a user without `prvReadRecordAuditHistory` or
  `prvReadAuditSummary`. The fallback and the *no privilege* sentence rest
  on Learn's description and the 403 the rig sends.
- **What a cleared column looks like on the wire** (P5): read as the mirror
  of a set — present on the old side only — with `null` and
  `DeletedAttributes` accepted too.
- **The 5 KB cap** (P12): Learn's number and its trailing ellipsis.
- **An Assign, a Share, an Associate** (P6): three of the detail kinds
  beyond an Update rest on Learn's samples and the rig's fixture. A Create
  was measured on the walkthrough (W8).
- **The *save the record first* state on the form** — reached in the rig
  only; the new account was saved before the tab was opened.
- **Why the attribute function counts one more than it lists** (W7).
- A history longer than one page of the *attribute* function, and a
  `PagingCookie` older than the page it came from.
- Audit history on the phone client — Learn says it is not available there.
- Canvas apps: no `context.webAPI`, no `contextInfo`, no same-origin fetch of
  an organisation URL. There is no canvas page for that reason.
- An on-premises organisation URL with the organisation in the path.

## Walkthrough — 0.1.0 on the form, 2026-09-18

The Accounts form on `cll365`, the control on an *Audit History* tab bound to
*Address 2: Street 1*, then rebound to *Address 1: Street 2* for W7; a new
account *test audit* for W8; the phone layout for W9. All ten the right way;
two things came from looking rather than asking.

| # | On the form | Expected | Answer |
| --- | --- | --- | --- |
| W1 | Open *City Power & Light* | Rows newest first, sixteen, the count | Sixteen rows, *Showing 16 of 16*, every column by its display name, *4 columns* where more than three changed, the April *Audit Enabled* event last with *No values are recorded for this change*. |
| W2 | Open the Credit Limit row | 30 → 40, one line | *Credit Limit* 30 → 40, one line — the `_base` shadow folded. |
| W3 | Open the address-lines row | Street 3 set, Street 2 changed, the composite | *Address 1* (the composite), *Address 1: Street 2* street → street 2, *Address 1: Street 3* *(empty)* → street 3. |
| W4 | The Column dropdown | Every column seen, display names | Twelve columns, display names, sorted. |
| W5 | The *Audit Enabled* row | The platform's label, no values | As expected — and **opening it repeated the sentence** it already showed. A row with nothing to open does not open now: the button is inert, no chevron, no `aria-expanded`. |
| W6 | Page size 5 | Five rows, *Showing 5 of 16*, *Load more* | *Showing 5 of 16* and *Load more*. |
| W7 | *Only this column* on *Address 1: Street 2* | The chip, that column's rows, a true total | The chip *Only Address 1: Street 2* and three rows — and **`Showing 3 of 4`** with nothing more to load: the attribute function's `TotalRecordCount` was one more than the details it returned, the column's audit-configuration event counted and not listed (or listed without an id). A complete list counts its rows now — *3 changes* — and `TotalRecordCount` is shown only while there is more to load. Why the function counts one more is *Not verified*. |
| W8 | A new account | *Save the record first*, then the Create | Saved before the tab was opened, so the *save first* state was not seen. **The Create was**: 31 columns, every one *(empty)* → the value, the platform's formatted values throughout (*Owner* as a name, *Currency* "US Dollar", every choice "Default Value", *Process* as a zero GUID). |
| W9 | The phone layout | Stacked rows, nothing clipped | Date, user and change on three lines; the values table with its header dropped and three columns fitting; the count on its own line. |
| W10 | Anything wrong | — | Nothing beyond W5 and W7. |

## Screenshots

Headless Chrome against `dev/preview.html` on the harness server
(`npm run harness -- --port 8097 --no-open`), at
`--force-device-scale-factor=2 --virtual-time-budget=6000 --hide-scrollbars`;
the page's `?width=` sets the width the host allocates and the root's, and
the window is 32 wider for the page's padding. Heights are
`document.body.scrollHeight` read off the page first.

| File | Query | Window |
| --- | --- | --- |
| `screenshot.png` | `?width=760` | 792×466 |
| `screenshot-expanded.png` | `?expand=2,3&width=760` | 792×564 |
| `screenshot-scoped.png` | `?scope=1&expand=1&width=760` | 792×232 |
| `screenshot-dark.png` | `?dark=1&expand=2&width=760` | 792×515 |
| `screenshot-narrow.png` | `?width=300&expand=2` | 332×855 |

New file names on every retake — the hub's mirror never re-fetches a path.
The logo is `media/logo.svg` in an `<img>` at 256 on a transparent body with
`--default-background-color=00000000`.

## Promoting a finding

When something here turns out to be general — true of PCF rather than true of
this control — move it to the skill's `references/control-patterns.md` and
replace it here with a line naming where it went. *Calling a Web API function
`context.webAPI` cannot* there carries P9, P13–P15 (the `AuditRecord`
finding), P3 (the audit table and `maxPageSize`), P4/P13 (`Prefer` on a
function) and P1 (`parameter.type` on a type group).
