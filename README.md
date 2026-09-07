# dses-murcia.github.io

## Jarvis: control your devices from your phone

A mobile-first web app, hosted on GitHub Pages at `/jarvis/`, that turns a phone into a voice
and touch controller for every device in Home Assistant, with Claude as the conversation agent.

- **Try it now:** `https://lmc3585.github.io/dses-murcia.github.io/jarvis/` runs in demo mode with sample devices.
  (The repo is owned by the `LMC3585` account, so GitHub serves it as a project site under that account, not at `dses-murcia.github.io`. Rename the repo to `lmc3585.github.io` to get the short address.)
- **Set it up for real:** follow [docs/SETUP.md](docs/SETUP.md). Everything is doable from a phone.
- **Hub configs:** [hub/](hub/) has the Docker Compose file, Home Assistant snippets and an n8n workflow.

### Repo layout

```
jarvis/        the web app (no build step: index.html, app.js, style.css, PWA manifest, service worker)
hub/           configs for the always-on hub (Home Assistant + n8n)
docs/SETUP.md  step-by-step guide, phone only
```

### How it works

The app calls Home Assistant's REST API directly from the browser using a long-lived access
token stored only on the phone. Device toggles use `/api/services`, and the chat and mic use
`/api/conversation/process`, which routes to whichever assistant you configured in Home
Assistant (Claude via the Anthropic integration). No server of ours sits in between, so there
is nothing extra to host, pay for, or leak your token to.
