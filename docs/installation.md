---
title: Installation
description: Import the solution and make the control available.
order: 2
---

# Installation

:::steps
1. Download the **managed** solution for your environment.
2. In the Power Platform admin centre, import the solution.
3. Publish all customizations.
:::

:::callout{type=warning}
Import the managed solution into production. The unmanaged one is for a
development environment where you intend to change the control itself — it
cannot be cleanly uninstalled.
:::

## Requirements

- A **model-driven app**. The control reads the record's identity from the
  form and calls the organisation's own Web API, neither of which a canvas app
  offers; see [Limitations](limitations.md).
- **Auditing switched on** — for the environment (Settings → Auditing →
  *Start auditing*) and for the table (the table's *Audit changes to its
  data* setting), and on the columns you care about. The control says which
  of these is off when the list is empty for that reason.
- Users need the **View Audit History** and **View Audit Summary** privileges
  (`prvReadRecordAuditHistory`, `prvReadAuditSummary`). Both are on the
  standard roles that can read the table's records; a role stripped of them
  sees the sentence for it rather than an empty list.

## Permissions the maker is asked for

The solution declares two platform features, and both appear as a prompt when
the control is added to a form:

| Feature | What it is used for |
| --- | --- |
| `WebAPI` | Reading the record's audit rows, and whether auditing is on for the environment |
| `Utility` | Display names for the columns in the list |

Both are declared **optional**. A host that provides neither still loads the
control — it says audit history is not available on this host rather than
failing to appear. Without `Utility` alone, columns are listed by their
logical names.

The control makes two more reads that no feature gates: same-origin requests
to the organisation's Web API for each row's old and new values
(`audits(…)/RetrieveAuditDetails`, a Dataverse function `context.webAPI`
cannot call) and for whether the table is audited
(`EntityDefinitions(…)`). Nothing leaves the organisation.
