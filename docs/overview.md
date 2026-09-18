---
title: Overview
description: What Audit History does, and when to reach for it.
order: 1
---

# Audit History

A record's audit history on the form: who changed what, when, and the old value beside the new.

::image{src=media/screenshot.png alt="An account form section listing the record's changes newest first — a date, a user and an action per row — with one row opened to show the Parent Account column going from empty to Contoso Europe and another showing Website cleared" zoom}

Place it on any column of a form and it lists the record's audited changes,
newest first: when, by whom, and what kind of change. Open a row and every
column that changed is there with its old value beside its new one — a lookup
as the related record's name, a choice as its label, a date as the platform
formats it. Filter the list to one column, or bind the control to a column
and switch *Only this column* on to make it that column's own history.

Model-driven apps keep the same information behind **Related → Audit
history**, a page away from the record and a grid apart from the form. This
control puts it where the question is asked.

## Why this one

- **It is honest about why the list is empty.** Auditing is a switch at three
  levels — the environment, the table, the column — and a user's access to
  the history is two privileges, not one. The control tells those apart:
  *Auditing is turned off for this table* is a different sentence from *No
  changes have been recorded*, and a maker fixes them in different places.
- **It reads what the platform records, as the platform formats it.** The rows
  come from the audit table and the values from Dataverse's own audit detail
  message, so a currency arrives with its symbol and a user as a name. A value
  the platform cut at its 5 KB cap is marked as cut.
- **A share is a share, and a relationship is a relationship.** Not every
  audited event is a column changing. Sharing a record, relating it to
  another, assigning it — each is shown for what it is rather than as an empty
  change.
- **It pages.** A page at a time, sized by you, with *Load more* at the bottom;
  a column filter that finds nothing on the loaded pages reads on, a few pages
  at most, before saying so.
- **It never writes.** The control is bound to a column only to have a place
  on the form and, optionally, a column to scope to. It reads nothing from
  that column and leaves it exactly as it found it.

## What it works with

| Host | Works | Notes |
| --- | --- | --- |
| Model-driven form (web) | Yes | |
| Model-driven form (phone, tablet) | Layout, yes | Audit history itself is not available in the mobile app; not yet measured there |
| Canvas app | No | No `context.webAPI`, no record identity, no organisation URL to call |
| Power Pages | No | No Web API from a code component there |

## What it does not do

It is read-only in this version: there is no *Restore* of an old value. See
[Limitations](limitations.md) for what else was decided against.
