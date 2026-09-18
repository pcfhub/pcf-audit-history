---
title: FAQ
description: Questions that come up more than once.
order: 6
---

# FAQ

## The list says "No changes have been recorded" but the record was edited

Auditing is on at three levels, and the control can only see two of them.
The environment and the table are checked and named when they are off. The
**column** is not: if the columns that changed are not audited, nothing was
recorded and the sentence is accurate. Open the table's columns in the maker
portal and check *Enable auditing* on the ones that matter.

## Why does a row say "You can see that this change happened, but not its values"?

The history needs the **View Audit History** privilege. A user without it,
who still has **View Audit Summary**, gets the rows from the audit table —
when, who, what kind of change — and that sentence in place of the values.

## Why is a value cut off with "…"?

Dataverse caps the old and new values it keeps for large text columns at
about 5 KB and appends an ellipsis. The control shows what the platform
stored and marks it *Cut at 5 KB*; the full text was never recorded.

## Can I restore an old value from here?

Yes, once the maker switches **Show Restore** on for the control. Open the
row, press *Restore* on the line, confirm. The value is written to the record
straight away and the restore appears at the top of the list as a change by
you. The form itself does not know about the write until it is refreshed —
the notice offers a *Refresh* — so save anything you have typed first.

## Why does one line have a Restore button and another not?

The platform cannot take every value back. A value it cut at 5 KB would be
written back cut, so it is not offered; nor is a status, an owner, a
composite address, or a column the table's metadata marks as not updatable.
A row that is not an Update — a Create, an Assign, a status change — has no
*Restore* at all. And on a read-only form, or for a user whose roles do not
allow writing the table, nothing is offered.

## Which column should I bind it to?

Any column. The control never reads or writes it. If you want the control to
show one column's history, bind it to that column and switch **Only this
column** on; otherwise any spare column with its label hidden does.

## Does it work in canvas apps or on the phone?

Canvas, no: there is no `context.webAPI`, no record identity and no
organisation URL for a code component to call. The phone client renders the
layout, but Dataverse does not make audit history available in the mobile
app. See [Limitations](limitations.md).
