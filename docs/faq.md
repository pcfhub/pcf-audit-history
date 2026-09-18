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

The rows come from the audit table and the values from a separate Dataverse
message, and they need different privileges: **View Audit Summary** for the
rows, **View Audit History** for the values. A user with the first and not
the second sees the list and that sentence on every row.

## Why is a value cut off with "…"?

Dataverse caps the old and new values it keeps for large text columns at
about 5 KB and appends an ellipsis. The control shows what the platform
stored and marks it *Cut at 5 KB*; the full text was never recorded.

## Can I restore an old value from here?

Not in this version. The control is read-only; restoring is a write with a
confirmation, and it is planned for a later release once the read half has
been measured on enough forms.

## Which column should I bind it to?

Any column. The control never reads or writes it. If you want the control to
show one column's history, bind it to that column and switch **Only this
column** on; otherwise any spare column with its label hidden does.

## Does it work in canvas apps or on the phone?

Canvas, no: there is no `context.webAPI`, no record identity and no
organisation URL for a code component to call. The phone client renders the
layout, but Dataverse does not make audit history available in the mobile
app. See [Limitations](limitations.md).
