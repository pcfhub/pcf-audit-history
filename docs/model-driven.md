---
title: Model-driven apps
description: Adding Audit History to a form, and what each property does.
order: 3
---

# Using it on a model-driven form

:::steps
1. Open the form in the modern form designer.
2. Select the column you want the history under — any column; the control
   never reads or writes it.
3. Under **Components → Add component**, choose **Audit History**.
4. Enable it for **Web**, **Phone** and **Tablet** as appropriate.
5. Save and publish.
:::

## The column it binds

Any column of the table can host the control: text, number, date, choice,
yes/no, a lookup. The binding does two things and nothing else: it gives the
control a place on the form, and it names a column for **Only this column**.

The control does not show the column's value, and it does not write the
column. Put it on the column whose history you want when you switch the scope
on, and on any spare column otherwise — a section of its own, with the label
hidden, reads well.

## What the list shows

One row per audited change, newest first: the date and time as the platform
formats them for the user, the user who made the change, the kind of change
(*Update*, *Created*, *Assigned*, *Shared*…), and the columns it touched.

Open a row for the values. Each changed column is one line — the old value
on the left, the new on the right, both as the platform formats them. A
column that was set for the first time has an empty old side; one that was
cleared says *(cleared)* on the new side. A value the platform cut at its
5 KB cap is marked *Cut at 5 KB*.

A share, a relationship change and a status change are listed for what they
are: who the record was shared with and at what access, which relationship
and which records, the old status and the new.

## Filtering

The **Column** dropdown at the top lists every column seen in the loaded
changes; pick one and the list narrows to changes that touched it. With
**Only this column** on, the dropdown is replaced by a chip naming the bound
column and the list is that column's history from the start.

A narrowed list that finds nothing on the loaded pages reads the next page on
its own, up to five, before saying *No changes have been recorded for …*.
The count at the top is what is shown of what has been loaded.

## Properties

| Property | What it does |
| --- | --- |
| **Only this column** | On: only changes to the bound column. Off (the default): every audited change to the record. |
| **Page size** | Changes fetched per page and per *Load more*, 1–100, default 20. Each change costs one request for its values, so this is a request count as much as a row count. |
| **Record id**, **Record table** | Not needed on a form — the control reads the record from the form itself. They exist for a host that does not say which record it is on: bind the first to the table's id column and type the table's logical name (`account`) in the second. |
| **Sample data (demo only)** | A JSON history rendered instead of the record's. Leave blank on a real form. |

## Unsaved records

A new record has no history and no identity yet. The control says *Save the
record to see its audit history* and starts listing once the form has saved.

## When the list is empty

The sentence says why, in the order a maker would fix it:

| Sentence | What to do |
| --- | --- |
| *You do not have permission to view audit history.* | The user's role lacks View Audit History or View Audit Summary. |
| *Auditing is turned off for this environment.* | Settings → Auditing → *Start auditing*. |
| *Auditing is turned off for this table.* | The table's *Audit changes to its data* setting. |
| *No changes have been recorded for this record.* | Auditing is on; nothing audited has changed since — or the columns that changed are not audited. |
