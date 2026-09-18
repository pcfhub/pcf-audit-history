# Audit History

A record's audit history on the form: who changed what, when, and the old value beside the new.

[![Build](https://github.com/pcfhub/pcf-audit-history/actions/workflows/build.yml/badge.svg)](https://github.com/pcfhub/pcf-audit-history/actions/workflows/build.yml)
[![Release](https://github.com/pcfhub/pcf-audit-history/actions/workflows/release.yml/badge.svg)](https://github.com/pcfhub/pcf-audit-history/actions/workflows/release.yml)

Documentation lives on [PCFHub](https://pcfhub.dev/components/pcf-audit-history), built
from the `docs/` directory in this repository. Edit the Markdown here; the hub
recompiles it.

## What it does

Placed on any column of a model-driven form, it lists the record's audited
changes newest first — when, by whom, what kind of change — and opens each
one to the columns that changed, old value beside new, as the platform
formats them. A filter narrows the list to one column; bound to a column with
*Only this column* on, it is that column's own history. Model-driven apps keep
the same information behind **Related → Audit history**, a page away from the
record; this puts it where the question is asked. With **Show Restore** on, a
value can be put back from the row — confirmed, written through the Web API,
and listed as the newest change.

Two decisions a reader will otherwise question. **The history is one request
per page, through a function `context.webAPI` cannot call.** Dataverse's
`RetrieveRecordChangeHistory` answers a page of changes with who, when and
the old and new values together — Learn says the Web API omits the who and
when (`AuditRecord`), and measured on a real form it does not — so the control
fetches it same-origin, pages it by `PagingInfo`, and shows its
`TotalRecordCount`. The `audit` table through `context.webAPI` is the
fallback for a user who may read the rows but not the history. And **an
empty list says why**: auditing off for the environment, off for the table, a
missing privilege, or simply nothing recorded — four sentences, because a
maker fixes them in four places.

The bound column is a place on the form and, optionally, a scope. The control
never reads its value and never writes it. **A restore is a write around the
form**: `webAPI.updateRecord` on the record with the detail's own raw value —
a lookup as `<associatednavigationproperty>@odata.bind`, the navigation
property read off the detail's annotation rather than a relationship
lookup — behind `openConfirmDialog`, then page 1 again so the restore is the
newest row. The form does not see the write until it is refreshed, and the
control says so.

## Properties

| Property | Type | Usage | Default | What it controls |
| --- | --- | --- | --- | --- |
| `value` | any column (type group) | bound, **required** | — | The column the control sits on; read for its name only, never written. |
| `columnScope` | TwoOptions | input | off | On: only changes to the bound column. |
| `showRestore` | TwoOptions | input | off | On: a *Restore* per value of an Update, behind a confirmation. Not offered on a read-only form, without Write on the table, or on a line the platform cannot take back. |
| `pageSize` | Whole.None | input | `20` | Changes per page and per *Load more*, 1–100; a page is one request. |
| `recordId`, `recordEntity` | SingleLine.Text | input | — | The record, for a host that does not say — the platform FAQ's fallback. A form supplies it. |
| `sampleData` | Multiple | input | — | A JSON history rendered instead of the record's — for the hub's demo. Blank on a real form. |

A React (virtual) control on the platform's React 16.14 and Fluent UI 9.46;
neither is bundled. Strings ship in English, German, French, Japanese and
Spanish. Two features are declared, both optional, and both prompt the maker
at install: `WebAPI` (whether the environment audits, the fallback's rows,
and a restore's write) and `Utility` (display names, the entity-set name
the function needs, and whether a column takes an update). The history and the table's audit setting are read with a
same-origin `fetch` that no feature gates.

## On the hub

`demo.fidelity` is **mocked**. The control's whole content comes from
a same-origin function call and `context.webAPI`, neither of which the hub's
harness supplies, so every preset carries a JSON history in `sampleData` and
the control renders that instead of querying. Everything that never leaves
the browser is real there — opening a row, the values table, a cleared
column, the 5 KB note, a share and a relationship as their own kinds, the
filter, the scope chip, paging, the narrow layout, dark and RTL. Seven
presets: a typical history, three pages, *Only this column*, just created,
no changes, auditing off for the table, and the not-available state.

## Install

Download the managed solution from the
[latest release](https://github.com/pcfhub/pcf-audit-history/releases/latest), or from
the component's page on the hub, and import it into your environment.

## Develop

```bash
npm install
npm start          # the PCF test harness
npm run build
npm run lint
npm run check      # what CI runs first: placeholders, pcfhub.json, control shape
npm run smoke      # assertions against the built bundle — see dev/
npm run harness    # serves dev/harness.html and opens it
```

`npm start` renders the control; `dev/` is for the states it cannot reach. Build
first, then `npm run smoke` for the assertions, or `npm run harness` for the
switches — field-level security, a failed business rule, a host that publishes
no theme or no column metadata, and for a dataset control, more than one page.
Both read the bundle `npm run build` wrote, and both are described in the header
of `dev/smoke.js`.

`npm run harness` serves the repository over `http://` rather than leaving you to
open the file: over `file://` a dataset fixture cannot be fetched and a module
script is refused, and both arrive as an empty control with a CORS error. It
takes `--port` and `--no-open`, and needs no dependency — `dev/serve.js` is
`node:http`. A React (virtual) control gets one too: `dev/fluent-stub.js` stands
in for the Fluent the platform would supply, and its header says exactly where
the stand-in is less capable than the real thing.

Run `npm run refreshTypes` after every manifest edit — until you do,
`context.parameters` is typed from the old manifest and `tsc` will accept code that
cannot work.

To pack the solution locally you need msbuild — either Visual Studio or the
Visual Studio Build Tools:

```bash
cd Solution
msbuild /t:build /restore /p:configuration=Release
```

Both zips land in `Solution/bin/Release`. This is the only local step that compiles
in **production** mode, so a green `npm run build` is not evidence the shipping
bundle compiles — and the pack is incremental, so delete `obj/`, `out/`,
`Solution/obj/` and `Solution/bin/` first if you intend to quote a bundle size from
it.

## Release

1. Bump the version in **three** places, in one commit — they are checked
   against each other in CI:
   - `AuditHistory/ControlManifest.Input.xml` → `<control version="…">`
   - `Solution/src/Other/Solution.xml` → `<Version>`
   - `package.json` → `"version"`
2. Write the release notes — what changed for the user, what was fixed, what
   they must do — in a Markdown file.
3. Tag with them: `git tag -a --cleanup=verbatim v1.2.3 -F notes.md && git push origin v1.2.3` — without `--cleanup=verbatim`, git drops every `## Heading` in the notes as a comment, silently

**The tag message is the release body, and the release body is the changelog
on the hub.** A lightweight tag gets GitHub's generated notes instead, which
for a repository without pull requests is a single compare link — and the
workflow warns when that is about to happen.

The release workflow builds, packs both solution types, and attaches them to a
GitHub Release. PCFHub picks the release up from its webhook within seconds, or
from the hourly sweep otherwise. A sync imports a draft; a person publishes it.

## Repository layout

| Path | What it is |
| --- | --- |
| `AuditHistory/` | The control: manifest, entry point, CSS, localised strings |
| `Solution/` | The Dataverse solution that packages it |
| `dev/` | A stand-in host: `npm run smoke` asserts, `harness.html` shows |
| `SPEC.md` | What building this corrected, and what is verified versus read |
| `docs/` | The pages PCFHub publishes — see the comments in each file |
| `media/` | Images and video referenced from the docs |
| `pcfhub.json` | The hub's manifest: identity, links, docs path, demo |
| `scripts/` | Template setup and the CI guard that keeps it adopted |

## Licence

[MIT](LICENSE)
