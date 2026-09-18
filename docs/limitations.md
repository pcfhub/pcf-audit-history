---
title: Limitations
description: What Audit History does not do, and why each of those is a decision.
order: 7
---

# Limitations

Each of these is a constraint that was chosen, not a defect waiting on a fix.

- **It is read-only.** No *Restore*, no edit, no delete. The values are shown
  as the platform recorded them; putting one back is a write with a
  confirmation, and this release measures the read half first.
- **Model-driven only.** It needs the record's identity from the form,
  `context.webAPI` for the rows and a same-origin call to the organisation's
  Web API for the values — a canvas app offers none of the three. There is no
  canvas page for that reason.
- **Not on the mobile app.** Dataverse does not make audit history available
  there; the layout renders and the list has nothing to show.
- **Who, when and what come from the audit table; the values come from a
  second call per row.** Dataverse's own record-history message returns old
  and new values with **no** record of who made the change or when — the Web
  API leaves that part out — so the control reads the rows from the audit
  table and asks for each row's values separately, correlated by the audit
  id. A page of twenty is twenty-one requests, made in parallel. That is the
  cost of showing both halves, and **Page size** is how you spend it.
- **Two privileges, and they degrade separately.** Reading the rows needs
  *View Audit Summary*; reading the values needs *View Audit History* as
  well. A user with only the first sees the rows and, on each, *You can see
  that this change happened, but not its values*.
- **The column filter narrows what has been loaded.** It is applied to the
  pages read so far, and a scope that finds nothing reads on — up to five
  pages — before saying so. It does not ask the server for one column's
  history; a column that changed once, long ago, may be beyond the pages it
  read. *Load more* keeps going.
- **A value is what the platform kept.** Large text is cut at about 5 KB with
  an ellipsis, and the control marks it. A column that is not audited is not
  in any row, and the control cannot tell you it is not audited — only the
  environment and table switches are checked.
- **Formatting is the platform's.** Dates are in the user's time zone and
  locale, numbers and currencies as Dataverse formats them, lookups as
  names. There is no property to change any of it.
- **Below about 480 pixels the row stacks** — the date, the user and the
  change on three lines — and the values table drops its header. The
  measurement is the control's own width, not the browser's, so a narrow form
  column on a desktop stacks too.
- **The demo is a sample.** PCFHub's demo has no Dataverse behind it; every
  preset there carries a JSON history in **Sample data** and the control
  renders that. On a form the property belongs blank.
- **Not yet measured:** the phone client, Power Pages, an on-premises
  organisation whose URL carries the organisation in the path, and a user
  without the privileges (the sentences exist; the refusal shape they are
  read from is documented rather than observed).
