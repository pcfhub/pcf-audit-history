---
title: API reference
description: Properties, generated from the control manifest.
order: 5
---

# API reference

<!--
  Do not write the property tables by hand.

  `props-table` renders from what the hub parsed out of
  ControlManifest.Input.xml at the release being viewed, so it cannot drift from
  the control.

  kind: input | bound | output | dataset | dataset_column
-->

## Input properties

::props-table{kind=input}

## Bound properties

::props-table{kind=bound}

## Notes

The control declares no outputs: it reads the bound column's name and never
its value, and writes nothing.

**Page size** is clamped to 1–100; blank is 20. It is the `maxPageSize` of
every audit-table query and the number of value requests a page costs.

**Record id** and **Record table** are read only when the form does not say
which record the control is on. The id must be a GUID and the table a logical
name (`account`), or both are ignored.

**Sample data (demo only)** is a JSON object:

```json
{
  "table": "account",
  "column": "name",
  "auditing": { "org": true, "table": true },
  "labels": { "name": "Account Name", "parentaccountid": "Parent Account" },
  "changes": [
    { "id": "a1", "when": "2026-09-18T14:05:00Z", "whenText": "9/18/2026 2:05 PM",
      "who": "Alex Chen", "action": 2,
      "changes": [ { "column": "name", "old": "Contoso", "new": "Contoso Ltd" } ] },
    { "id": "a2", "when": "2026-09-17T10:00:00Z", "who": "Priya Raman", "action": 14,
      "share": { "principal": "Alex Chen", "old": "None", "new": "ReadAccess" } },
    { "id": "a3", "when": "2026-09-16T09:00:00Z", "who": "Alex Chen", "action": 1,
      "changes": [ { "column": "name", "new": "Contoso" } ] }
  ]
}
```

`changes` is newest first, as the platform lists them. `action` is the audit
action code (1 Create, 2 Update, 13 Assign, 14 Share, 41 Set State …) and
`actionText` may override its label. Each change carries either `changes` —
column, old and new, an absent side meaning empty — or a `share` or
`relationship` object. `auditing` drives the empty-state sentences when
`changes` is empty; `labels` are display names for columns; `column` names the
column *Only this column* scopes to when no bound column says. When this
property holds anything at all, the control renders it and makes **no query**
— it exists for PCFHub's demo and for previewing the layout, and belongs
blank on a real form.
