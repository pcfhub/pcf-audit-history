---
title: Limitations
description: What Audit History does not do, and why each of those is a decision.
order: 7
---

# Limitations

Each of these is a constraint that was chosen, not a defect waiting on a fix.

- **A restore is a write around the form.** It goes through the Web API to
  the record, so the form keeps showing the earlier value until it is
  refreshed — the notice says so and offers a *Refresh*. An unsaved edit on
  the form to the same column will overwrite the restore when the form
  saves; save first. It is off unless the maker switches **Show Restore**
  on.
- **Not every value can go back.** A value the platform cut at 5 KB, a
  status or owner column, a composite address and a column the metadata
  marks as not updatable have no *Restore*; nor does any row that is not an
  Update. The server's own refusals — a business rule, a plugin, a column
  made read-only since — are shown on the row as the server phrased them.
- **No edit, no delete.** The history is what the platform recorded; the
  control puts values back, it does not change what was recorded.
- **Model-driven only.** It needs the record's identity from the form and a
  same-origin call to the organisation's Web API for the history — a canvas
  app offers neither. There is no canvas page for that reason.
- **Not on the mobile app.** Dataverse does not make audit history available
  there; the layout renders and the list has nothing to show.
- **One request per page, through a Dataverse function.** The history comes
  from `RetrieveRecordChangeHistory`, which answers who, when and the old
  and new values together, paged and counted. Learn says the Web API leaves
  out who and when; on every environment this control was measured on, it
  does not. Should an environment ever answer without them, the control
  falls back to the audit table for the rows and shows each row's values on
  request.
- **Two privileges, and they degrade separately.** Reading the history needs
  *View Audit History*; a user without it but with *View Audit Summary* sees
  the rows from the audit table and, on each, *You can see that this change
  happened, but not its values*. A user with neither sees the sentence for
  it.
- **The column dropdown narrows what has been loaded.** It is applied to the
  pages read so far, and a choice that finds nothing reads on — up to five
  pages — before saying so. **Only this column** is different: it asks the
  server for that column's history, so it is complete and counted — and it
  includes the audit-configuration events for the column (*Audit Enabled*,
  *Attribute Audit Started*), which the platform files under the column and
  which carry no values.
- **Money shows as a number.** The platform sends a currency column's old
  and new values without formatting, so a credit limit reads *30* → *40*,
  not *$30.00* → *$40.00*. Numbers, dates, choices and lookups arrive
  formatted.
- **A value is what the platform kept.** Large text is cut at about 5 KB with
  an ellipsis, and the control marks it. A column that is not audited is not
  in any row, and the control cannot tell you it is not audited — only the
  environment and table switches are checked.
- **Formatting is the platform's.** Dates are in the user's time zone and
  locale, numbers and choices as Dataverse formats them, lookups as names.
  There is no property to change any of it.
- **Below about 480 pixels the row stacks** — the date, the user and the
  change on three lines — and the values table drops its header. The
  measurement is the control's own width, not the browser's, so a narrow form
  column on a desktop stacks too.
- **The demo is a sample.** PCFHub's demo has no Dataverse behind it; every
  preset there carries a JSON history in **Sample data** and the control
  renders that. On a form the property belongs blank.
- **Not yet measured:** the phone client, Power Pages, an on-premises
  organisation whose URL carries the organisation in the path, a user without
  the privileges (the sentences exist; the refusal shape they are read from is
  documented rather than observed), and what a *cleared* column looks like on
  the wire — a column set for the first time arrives on the new side only,
  and cleared is read as the mirror of that.
