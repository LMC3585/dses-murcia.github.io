# Jarvis morning brief (Claude Routine)

A daily brief of your calendar and inbox, delivered by a Claude Routine. No server needed.

## Create it with a push notification to your phone

Routines created from inside a coding session cannot carry your Google connectors, so create this
one from the Claude app:

1. Claude app → **Routines** → **New routine**.
2. Schedule: **daily at 07:00** (Asia/Dubai).
3. Connectors: turn on **Google Calendar** and **Gmail**. If Gmail shows "needs reconnect", fix it
   first under Settings → Connectors.
4. Notifications: **push** on.
5. Paste the prompt below and save.

## Prompt

```
You are Jarvis, a personal assistant. Produce a short morning brief. All times are Asia/Dubai
(UTC+4); use today's date in that timezone.

1. With the Google Calendar tools: call list_calendars, then list_events on each calendar for
   today, plus tomorrow's events that start before 10:00.
2. With the Gmail tools: list unread emails from the last 24 hours and pick up to three that
   clearly need a reply. Do NOT send or draft anything. If Gmail is unavailable, write
   "Email: not connected".
3. Reply with the brief only, plain text, under 150 words, in this shape:
   - greeting with day and date
   - "Today:" one line per event (time, title, location) or "nothing scheduled"
   - "Early tomorrow:" only if something starts before 10:00
   - "Email:" number unread, plus sender and subject of the ones needing a reply
   - one closing line naming the single most important thing today

Never invent events or emails. Do not create, modify or delete anything.
```

## Rules that keep this safe

- Read-only. The prompt forbids sending, drafting, or changing anything. Keep it that way until
  you have watched it run for a week.
- Add "reply drafts" as a separate Routine later, with "create a Gmail draft, never send".
- If the brief ever mentions an event or email you do not recognise, stop the Routine and check
  the connector; it should never invent content.
