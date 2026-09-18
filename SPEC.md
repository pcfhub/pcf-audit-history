# Audit History

A record's audit history on the form: who changed what, when, and the old value beside the new.

Bound to **any** column — it never reads or writes the value; the binding is a
place on the form plus, through `attributes.LogicalName`, an optional *Only
this column* scope. The record's own identity comes from
`mode.contextInfo` (`entityId`, `entityTypeName`), with the `recordId` /
`recordEntity` inputs as the documented fallback. Read-only in 0.1.0: no
restore, no edit, no delete.

## Measured — the 0.0.1 probe

The 0.0.1 build is a probe: `AuditHistory/probe.tsx` asks the form the
questions below and prints the answers into the control. Every design decision
under *Where the rows come from* rests on one of them, so nothing under 0.1.0
is written before the answers come back. Answers are recorded here with the
environment and the date.

**Environment:** the Accounts form on `cll365` (`https://cll365.crm.dynamics.com`),
2026-09-18, the control bound to *Account Name* (`name`). Before opening the
form the record was edited and saved so the history has the shapes the
questions need: *Parent Account* set (a lookup), *Website* cleared (text),
*Industry* changed (a choice), and more than 5,000 characters pasted into
*Description* (the cap).

| # | Question | Decides | Answer |
| --- | --- | --- | --- |
| P1 | What does `parameters.value` look like on an `of-type-group` binding to `name` — `type`, `attributes.LogicalName` / `DisplayName`, `security`? And `mode.contextInfo`: `entityId` bare? `entityTypeName` present? | `resolveBoundColumn()`, `resolveRecord()`; whether the type group survives on a form or falls back to `SingleLine.Text` | Measured 2026-09-18 (run 1, bound to *Address 2: Street 1*): the type group is offered on any column and survives on the form — `attributes.LogicalName` = `address2_line1`, `DisplayName` = "Address 2: Street 1", `attributes.Type` = `string`, while **`parameter.type` said `Currency`**, a member of the group rather than the column's type, so a type-group binding's `type` is not to be read. `security` = `{ secured: false, editable: true, readable: true }`; `raw` = `null`. `mode.contextInfo` = `{ entityTypeName: "account", entityId: "83e84297-…", entityRecordName }` — bare, lower-case. `page.getClientUrl()` present, answering `https://cll365.crm.dynamics.com`. Unset inputs arrive `null`; `pageSize` as its default 20. |
| P2 | `webAPI.retrieveMultipleRecords('audit', '?$select=…&$filter=_objectid_value eq <id>&$orderby=createdon desc', 5)`: status, elapsed, the first row's keys — are `createdon@…FormattedValue`, `action@…FormattedValue`, `_userid_value@…FormattedValue` and `…lookuplogicalname` present without a `Prefer` header? Is `nextLink` set at page size 5? | `audit/rows.ts` reads formatted values or falls back; `audit/actions.ts` prefers the platform's label | Measured: `retrieveMultipleRecords('audit', …, 5)` answered in 110 ms with the formatted values **without** a `Prefer` header — `createdon@…FormattedValue` ("9/17/2026 8:25 PM", the user's zone), `action@…`, `operation@…`, `_userid_value@…FormattedValue` and `…lookuplogicalname` — plus `versionnumber` unasked. The result carries `nextLink` as **an empty string** when there is no next page, not `undefined`. |
| P3 | Does the PCF Web API follow its own `nextLink` when it is passed back as `options` — the full URL, or only its query part? Failing both, does a keyset filter `createdon lt <last>` page? | the `PAGING` constant in `audit/query.ts`; the rig's `nextLink` modelling | Not measured: the record had one audit row, so no `nextLink`. The keyset filter `createdon lt <instant>` is accepted (0 rows). 0.0.2 asks again on a record with more changes. |
| P4 | A same-origin `fetch` of `audits(<id>)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`: status, elapsed, body keys; does `Prefer: odata.include-annotations="*"` add the formatted-value annotations? Then a whole page of 20 in parallel: total elapsed, any 429 | eager vs lazy `DETAIL_MODE`; whether the column filter is per page or per expanded row | Measured: 200 in 98 ms. **Without `Prefer` the values carry no annotations** (`_parentaccountid_value` alone); with `Prefer: odata.include-annotations="*"` the formatted value, `associatednavigationproperty` and `lookuplogicalname` arrive. One row's worth of parallel: 96 ms. **The detail carries `AuditRecord`** — a key Learn says the Web API omits. What it holds is 0.0.2's P13. |
| P5 | The `AuditDetail` for an Update that set a lookup, cleared a text column and changed a choice: the exact `OldValue` / `NewValue` keys and annotations (`FormattedValue`, `lookuplogicalname`, `associatednavigationproperty`); is a cleared column absent from `NewValue` or present as `null`; what is in `DeletedAttributes` | `audit/diff.ts` — cleared vs absent, lookup key folding; the rig's fixture shapes | Partly measured: a lookup **set** is `OldValue: { @odata.type }` only and `NewValue` with the lookup and its three annotations; `DeletedAttributes` = `{ Count: 0, Keys: [], Values: [] }`. The cleared column and the choice were not on the record yet — 0.0.2. |
| P6 | The `AuditDetail` for the Create row (action 1) and, if the record was assigned or shared, for 13 / 14: `@odata.type` values; is Create's `OldValue` empty and how many keys does its `NewValue` carry | the non-attribute detail kinds; whether Create renders as *set* rows | Not measured: the sample record's Create predates auditing. 0.0.2 asks on a record with more rows. |
| P7 | The refusal shapes: `retrieveMultipleRecords('audit', …)` and the details fetch for a user **without** `prvReadAuditSummary`; and the fetch of a bogus `audits(00000000-…)` id | `isPrivilegeFault()`, the rig's 403 body, the *no privilege* state | Measured for the bogus id: **404**, body `{ error: { code: "0x80048d02", message: "The HTTP status code of the response was not expected (404)… Could not find item…" } }` — the message wraps the inner response as text. The privilege refusal is still unmeasured (needs a second user). |
| P8 | `retrieveMultipleRecords('organization', '?$select=isauditenabled&$top=1')` and a fetch of `EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled,EntitySetName`: status, the `IsAuditEnabled` shape (`{ Value, CanBeChanged }`?), elapsed; and the bound column's own `IsAuditEnabled` | `probeEnabled()`; the rig's `auditEnabled` switch shape | Measured: `organization` through `retrieveMultipleRecords` in 211 ms — `isauditenabled: true` with a formatted "Yes", plus `isuseraccessauditenabled` and `auditretentionperiodv2` (30). `EntityDefinitions(LogicalName='account')?$select=IsAuditEnabled,EntitySetName,PrimaryNameAttribute` 200 in 77 ms: `IsAuditEnabled` = `{ Value: true, CanBeChanged: true, ManagedPropertyLogicalName: "canmodifyauditsettings" }`, `EntitySetName` = `accounts`. The column's own `IsAuditEnabled` reads the same shape off `…/Attributes(LogicalName='x')`. |
| P9 | Unbound `RetrieveRecordChangeHistory(Target=@t,PagingInfo=@p)` with `@t={'@odata.id':'accounts(<id>)'}` and `@p={"PageNumber":1,"Count":5,"ReturnTotalRecordCount":true}`: status, `MoreRecords`, `TotalRecordCount`, `AuditDetails.length`; **is `AuditRecord` absent, as Learn says**; does its order match the `audits` query's first five, compared by the columns each detail touches | whether strategy B (one call, zipped by position) is even viable; `TotalRecordCount` as the *Showing n of m* source | Measured: 200 in 120 ms, `TotalRecordCount` 2 and two `AuditDetails` where the `audits` query listed **one** row; `MoreRecords` false, no cookie. **Every detail carries `AuditRecord`**, contrary to Learn. The second detail touched no column. Order against the rows could not be compared with one row; 0.0.2 dumps `AuditRecord` and pages it. |
| P10 | `RetrieveAttributeChangeHistory(Target=@t,AttributeLogicalName=@a,PagingInfo=@p)` for `name`, from a form: status, `TotalRecordCount` | whether *Only this column* can get a true server-side total; otherwise the scope is client-side over the loaded pages | Measured: 200 in 106 ms, `TotalRecordCount` 1 for `address2_line1` — the function works from a form and counts server-side, which is what a true *Only this column* needs. What its rows hold is 0.0.2's P10 dump. |
| P11 | `utils.getEntityMetadata('account', [columns]).Attributes` — an `ItemCollection` with `get()` / `getAll()`? Is `DisplayName` a string or a label object? elapsed | `columnLabels()`; whether `Utility` stays declared | Measured: `getEntityMetadata('account', [five columns])` in 1 ms; `Attributes` is an item collection with `get()` and `getAll()`; each item's **`DisplayName` is a string** ("Industry"), with `LogicalName`, `AttributeType` (11) and `AttributeTypeName` ("picklist") beside private `_…` fields. `getAll()` returned exactly the five asked for. The rig models this shape. |
| P12 | A Description change over 5 KB: does the value in the detail end with `…`, and at what length | `CAP_HINT` in `audit/diff.ts`; the *Cut at 5 KB* note | Not measured: no Description change on the record yet — 0.0.2. |

## Where the rows come from

Learn is explicit that the Web API's `RetrieveRecordChangeHistory` leaves
`AuditRecord` out of every `AuditDetail` — no who, no when, no action — so a
list cannot be drawn from that one function. The design that follows:

- **Rows** from the `audit` table through `context.webAPI.retrieveMultipleRecords`
  (`_objectid_value eq <record>`, `createdon desc`, the platform's own paging).
  Needs `prvReadAuditSummary`.
- **Details** — the old value beside the new — per row, through a same-origin
  `fetch` of `audits(<auditid>)/Microsoft.Dynamics.CRM.RetrieveAuditDetails`,
  a function bound to the audit row that `context.webAPI` cannot call.
  Correlated by `auditid`, never by position. Needs `prvReadRecordAuditHistory`.
- The two privileges degrade separately: a user with only the first sees the
  rows and *details unavailable* per row.

The alternative — one `RetrieveRecordChangeHistory` call per page zipped by
position with an `audits` query of the same size — is a stub behind the same
`AuditSource` interface; P9 records whether the positions even agree.

## Not verified

- **The privilege refusal shape** (P7) unless the probe is run under a role
  without `prvReadAuditSummary`.
- Audit history on the phone client — Learn says it is not available there.
- Canvas apps: no `context.webAPI`, no `contextInfo`, no same-origin fetch of
  an organisation URL. There is no canvas page for that reason.
