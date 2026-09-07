# Jarvis setup guide (phone only, no laptop)

Everything below can be done from a phone browser. Total hands-on time is about two hours
spread over a few days, mostly waiting for hardware to arrive.

## What you are building

```
 Your phone                     Always-on hub                    Devices
 ┌─────────────────┐   HTTPS    ┌──────────────────┐   Wi-Fi     ┌──────────┐
 │ Jarvis web app  │ ─────────► │ Home Assistant   │ ──────────► │ plugs    │
 │ (this repo)     │ ◄───────── │  + Claude agent  │             │ lights   │
 │ voice / touch   │            │  + n8n (optional)│             │ TV, AC…  │
 └─────────────────┘            └──────────────────┘             └──────────┘
```

- **Jarvis web app** (`/jarvis/` in this repo) is the remote control and voice interface. It is
  hosted free on GitHub Pages and installs to your home screen like a normal app.
- **Home Assistant** is the hub. It talks to the devices and runs the AI conversation agent.
- **Claude** is the brain, plugged into Home Assistant's Assist feature through the Anthropic
  integration.
- **n8n** is optional glue for things that are not devices (calendar, email, reminders).

## Step 0: publish the app (5 minutes)

1. Merge this branch to `main`. GitHub Pages serves the repo automatically.
2. Open `https://dses-murcia.github.io/jarvis/` on your phone. It starts in **demo mode** with sample
   devices so you can try the interface before owning any hardware.
3. In Chrome tap the menu, then **Add to Home screen**. On iPhone use Safari's share sheet,
   then **Add to Home Screen**.

## Step 1: choose where the hub runs

Pick one. Both work with this app.

| Option | Cost | Best for | How |
|---|---|---|---|
| Raspberry Pi 4/5 (or any mini PC) at home | one-time hardware purchase | most people; devices on your home Wi-Fi are reachable without any cloud | Flash **Home Assistant OS** with Raspberry Pi Imager on any phone that supports USB-OTG and an SD card reader, or ask a shop to flash it. Plug in, wait 10 minutes, open `http://homeassistant.local:8123`. |
| Cloud VM (any provider, 2 GB RAM is enough) | a few dollars per month | no hardware at home, or you travel a lot | SSH from a phone app (Termius, JuiceSSH), install Docker, copy `hub/docker-compose.yml`, run `docker compose up -d`. Devices then need cloud-capable integrations or a VPN back home. |

A home hub is the recommended path. Cloud-only setups cannot reach local-only devices.

## Step 2: make Home Assistant reachable over HTTPS

The app is served over HTTPS, so browsers refuse to call a plain `http://` hub. You need one of:

- **Home Assistant Cloud** (paid subscription from Nabu Casa, the company behind HA). Gives you an
  `https://xxxx.ui.nabu.casa` URL with zero networking. Easiest, and it funds the project.
- **Tailscale** (free tier). Install the Tailscale add-on in HA and the Tailscale app on your phone.
  Then enable HTTPS certificates in the add-on so you get an `https://homeassistant.<tailnet>.ts.net` URL.

Never port-forward port 8123 on your router. Exposed hubs get scanned within hours.

## Step 3: connect the app to your hub

1. In Home Assistant open your **Profile → Security → Long-lived access tokens → Create token**.
   Name it "Jarvis phone". Copy it once. It is never shown again.
2. Add this to `configuration.yaml` (File editor add-on, or Settings → Add-ons → File editor) and
   restart HA. See `hub/homeassistant/configuration.yaml` for the full snippet.

   ```yaml
   http:
     cors_allowed_origins:
       - https://dses-murcia.github.io
   ```

3. In the Jarvis app open **Settings**, paste the HTTPS URL and token, tap **Test connection**,
   then **Save**. The status pill turns green and your real devices appear.

The token lives only in that phone's browser storage. If the phone is lost, revoke the token in
the same HA profile page and every copy of it stops working.

## Step 4: give Jarvis a brain (Claude)

1. Get an API key from the Anthropic Console.
2. In HA: **Settings → Devices & services → Add integration → Anthropic**. Paste the key.
3. Open the integration's options and turn on **Control Home Assistant** so the model can act on
   devices, not only chat. Pick a smaller model for everyday commands to keep cost down. Check
   current model names and prices in the Anthropic docs before choosing.
4. **Settings → Voice assistants → Add assistant**. Name it Jarvis, set the conversation agent to
   the Anthropic one, and make it the preferred assistant.
5. In the Jarvis app, tap the mic and say "turn off the living room light". If you created more
   than one assistant, paste its agent id (shown in the Voice assistants page) into the app's
   optional field.

## Step 5: add devices

Start with devices that work locally, without a vendor cloud, so they keep working when the
internet is down:

- **Smart plugs and switches**: Shelly, Sonoff (flashed with Tasmota or ESPHome), or anything
  with the Matter logo.
- **Lights**: Philips Hue, IKEA, or any Zigbee bulb with a cheap USB Zigbee coordinator on the Pi.
- **TV and media**: most Android TVs, Samsung, LG and Chromecast are auto-discovered.
- **Air conditioner and other remote-controlled things**: a Broadlink RM4 IR blaster.
- **PC**: Wake-on-LAN integration to turn it on; HASS.Agent on the PC for shutdown and sensors.
- **Anything else**: an ESP32 board (about the price of a coffee) flashed with ESPHome turns any
  relay, sensor or motor into a Home Assistant device. ESPHome flashes from the browser.

Every device you add in HA shows up in the app automatically. Tap the star on the ones you use
most and they pin to the top.

## Step 6 (optional): n8n for everything that is not a device

Import `hub/n8n/jarvis-command.workflow.json` and follow `hub/n8n/README.md`. Branch off the
webhook to add reminders, email, calendar lookups or calls to other APIs.

## Things that will bite you later

- **LLM cost scales with device count.** Every voice command sends your entity list as context.
  Expose only the devices Jarvis needs (Settings → Voice assistants → Expose) and use a small model.
- **Keep safety automations in HA, not in the AI.** Lights-off-at-midnight, door lock at bedtime
  and similar should be plain automations that run with no internet. Examples in
  `hub/homeassistant/automations.yaml`.
- **Back up HA.** Settings → System → Backups. Turn on automatic backups to Google Drive or HA Cloud.
- **Rotate the phone token** if you ever share your screen or the phone changes hands.
- **Vendor-cloud devices break.** Prefer local-control brands. If you already own Tuya-style
  devices, the LocalTuya integration can often move them to local control.
- **Voice on iPhone** works through Safari's speech recognition but is less reliable than Chrome
  on Android. Typing always works.
