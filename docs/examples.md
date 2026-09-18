---
title: Examples
description: Three ways to place it.
order: 4
---

# Examples

## The record's history, in a tab of its own

Add a **History** tab to the main form with one full-width section, put any
column in it — *Account Name* will do — with the label hidden, and add the
control. Leave **Only this column** off and set **Page size** to 25.

The tab reads as the record's timeline: every audited change, newest first,
with the values a click away and a column filter at the top.

## One column's history, beside the column

Put the control on the column itself, in the section where the column already
is, and switch **Only this column** on. A *Credit Limit* with its own history
underneath — who raised it, from what, when — is the case this exists for.

Keep **Page size** small here; a column that changes rarely will make the
control read a few pages looking for it.

::image{src=media/screenshot-scoped.png alt="The control with a chip reading Only Account Name and three rows, the first opened to show the old name beside the new" zoom}

## A quick-look section on a busy form

A one-column section near the top, **Page size** 5, no scope. It answers
*what changed recently* without leaving the form; *Load more* is there for
the rest.
