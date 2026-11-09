# Mochi: a context-preserving voice assistant

MLH Global Hack Week: Builders Week, *The Context-Preserving Assistant (Full-Stack Identity & API Access)*.

Mochi is a cute 2D cat you talk to. Tap it, speak, and it answers out loud, acting **as you**:

1. **Auth0 Universal Login** signs you in (`express-openid-connect`, with `offline_access` for silent refresh).
2. **First-party API** (`/api/profile`) holds your settings: city, units, nickname, reply language, default event length, reply style and voice. It accepts only an Auth0 access token (`express-oauth2-jwt-bearer`) and keys data on the token's `sub`. The assistant reaches it with *your* token, never by reading the store.
3. **Third-party API via Auth0 Token Vault**: Google Calendar. Your Google account is linked once through Auth0 Connected Accounts; afterwards the server trades your Auth0 refresh token for a Google access token (`federated-connection-access-token` exchange) whenever Mochi needs your calendar. Weather comes from Open-Meteo (public, no token).

```
Browser ──session──▶ Assistant ──your access token──▶ First-party API (/api/profile)
   ▲ voice             │  └──Token Vault exchange──▶ Google Calendar (as you)
   └── ElevenLabs ◀────┘  └──────────────────────────▶ Open-Meteo (weather)
```

**One conversation, both APIs:** "Am I free tomorrow afternoon? If so book 2 hours for gym." Mochi reads your default city, units, language and event length from the first-party API, checks the forecast, finds a free slot in Google Calendar and creates the event.

## Features

- **Voice mode by default**: one tap starts a conversation; Mochi listens, answers aloud, then listens again. Tap while it talks to interrupt; two silences and it naps. A hidden ⌨ button allows typing.
- **Mochi, the 2D cat**: an SVG kitten with moods (happy, concerned, confused) and states (listening, thinking, speaking, sleeping), eyes that follow your pointer, blinks, lip sync from the voice audio, and petting (stroke it).
- **AI voice**: ElevenLabs only (no browser or Google voices). Delivery follows the reply's mood; the language is sent so Indonesian sounds Indonesian.
- **Brain**: Claude if `ANTHROPIC_API_KEY` is set, else any OpenAI-compatible model (default: Gemini via `LLM_API_KEY`), else a built-in keyword engine (English and Indonesian). A planner routes simple requests to the fast path and the rest to the tool-using agent.
- **Tools**: weather and 7-day forecast, list/create/move/delete calendar events, find free time, day briefing with recommendations (umbrella, back-to-back meetings, best focus block), read/update profile.
- **Pages**: Talk, Agenda (forecast, briefings, next 7 days), History (transcript), Settings (profile, voice, connections).
- **Optional**: a photo-real avatar via [Simli](https://simli.com) when `SIMLI_API_KEY` and `SIMLI_FACE_ID` are set.

## Setup

1. **Auth0** (free account at [auth0.com](https://auth0.com)):
   - **Applications → Create Application → Regular Web Application**. Allowed Callback URLs `http://localhost:3000/callback, http://localhost:3000/connect/callback`; Allowed Logout URLs `http://localhost:3000`. Under Advanced → Grant Types enable *Refresh Token* and *Token Vault*.
   - **Applications → APIs → Create API**, Identifier `https://context-assistant-api`, enable *Allow Offline Access*, and authorize the app for it.
   - Activate the **My Account API** and give the app access to `create:me:connected_accounts`.
   - **Authentication → Social → Google**: your own Google OAuth client (Calendar API enabled, scope `https://www.googleapis.com/auth/calendar.events`), with *Connected Accounts for Token Vault* turned on.
2. Copy `.env.example` to `.env` and fill in the Auth0 values, a random `SESSION_SECRET`, and optionally `LLM_API_KEY` (Gemini) and `ELEVENLABS_API_KEY`.
3. Run:

```bash
npm install
npm test        # assistant + keyword engine checks (no network)
npm start       # builds the browser code, then http://localhost:3000
```

Requires Node 23.6+ (the server runs TypeScript directly). Voice input needs Chrome or Edge. Link Google Calendar from **Settings → Connections**.

## Layout

| Path | What |
| --- | --- |
| `src/server.ts`, `src/app.ts` | Server entry, routes, pages (only `public/` is served) |
| `src/auth/` | Universal Login session; token helpers (`asUser`, Token Vault `googleToken`, My Account API) |
| `src/api/profile.ts` | First-party API (Bearer-only) |
| `src/routes/` | `/me`, `/chat`, `/agenda/data`, `/history/data`, `/tts` (ElevenLabs), `/connect/*` (Connected Accounts), `/simli/token` |
| `src/assistant/` | LLM loop (Claude / OpenAI-compatible), planner, tools, calendar, weather, recommendations, keyword engine |
| `src/client/` | Browser code (compiled to `public/js`): the cat, voice in/out, pages |
| `test/` | Self-checks with faked network |

## Limits

- Profiles and transcripts live in `profiles.json` and memory, so it runs as a single instance.
- While the Google OAuth app is in testing mode, only listed test users can link a calendar.
