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

With the dropdown, a narrowed list that finds nothing on the loaded pages
reads the next page on its own, up to five, before saying *No changes have
been recorded for …*. With **Only this column**, the server does the
narrowing — the whole history of that column, paged — and the count is its
true total.

## Properties

| Property | What it does |
| --- | --- |
| **Only this column** | On: only changes to the bound column. Off (the default): every audited change to the record. |
| **Show Restore** | On: each value of an Update can be put back with a *Restore*, after a confirmation — see below. Off (the default): the history is read-only. |
| **Page size** | Changes fetched per page and per *Load more*, 1–100, default 20. A page is one request. |
| **Record id**, **Record table** | Not needed on a form — the control reads the record from the form itself. They exist for a host that does not say which record it is on: bind the first to the table's id column and type the table's logical name (`account`) in the second. |
| **Sample data (demo only)** | A JSON history rendered instead of the record's. Leave blank on a real form. |

## Restoring a value

With **Show Restore** on, open an *Updated* row: every line whose earlier
value can be put back has a *Restore* at its end, and a row with more than
one gets a *Restore all* above the table. Pressing one opens the platform's
confirmation naming the column and the value it goes back to; confirming
writes it to the record at once, and the restore appears at the top of the
list as an *Updated* change by you — the proof that it landed. A line whose
earlier value was empty is restored by clearing the column.

What the form does not do by itself is show the new value: the write went
through the Web API, around the form, so the field on the form still shows
what it showed. The notice above the list says so and offers **Refresh**,
which reopens the record. Save any edits you want to keep before refreshing.

*Restore* is not offered on a read-only form (an inactive record), to a
user whose roles do not allow writing the table, on a row that is not an
Update (a Create has nothing to go back to; Assign and Set State are
operations, not values), or on a line the platform cannot take back: a
value cut at 5 KB, a status or owner column, a composite address, a column
the table's metadata marks as not updatable. A write the server refuses —
a business rule, a plugin, a column that became read-only — shows the
server's own sentence on the row.

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
