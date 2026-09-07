# n8n workflow: Jarvis command

Import `jarvis-command.workflow.json` in n8n (Workflows → Import from file). It exposes
`POST /webhook/jarvis` with body `{"text": "turn off the kitchen light"}` and returns
`{"reply": "..."}` from Home Assistant's conversation agent.

After importing, create two **Header Auth** credentials (Credentials → Add → Header Auth) and
attach them to the nodes that show a missing-credential warning:

| Credential name       | Header name     | Value                                              | Used by            |
|-----------------------|-----------------|----------------------------------------------------|--------------------|
| Jarvis webhook key    | `X-Jarvis-Key`  | a long random string you generate                  | Webhook node       |
| Home Assistant token  | `Authorization` | `Bearer <long-lived access token from HA profile>` | Ask Home Assistant |

Then open the **Config** node and set `ha_url` to your Home Assistant HTTPS address.

Why this exists: Home Assistant handles devices. n8n is where you add everything else the
assistant should do (calendar, email, reminders, other APIs) by branching after the Webhook node.
