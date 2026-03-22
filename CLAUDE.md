# Gong for HubSpot — Project Notes

## What this app does
Plays a synthesized gong sound when a deal reaches Closed Won in HubSpot.

## Key IDs
- **App ID:** 34522793
- **Client ID:** ec8487d8-b3d5-49a9-a7af-dda88d0303ee
- **Portal ID:** 442976293 (gg [standard])
- **Production URL:** https://hubspot-gong-app-production.up.railway.app

## Infrastructure
- **Frontend (UI extension):** HubSpot project (`packages/ui-extension`), deployed via `hs project upload` from that directory
- **Backend:** Railway — auto-deploys from `main` branch pushes

## HubSpot project structure
```
packages/ui-extension/src/app/
  app-hsmeta.json          — app config (auth, scopes, distribution)
  package.json
  cards/
    GongCard-hsmeta.json
    GongCard.jsx
  webhooks/
    webhooks-hsmeta.json   — webhook subscriptions (separate 2025.2 component)
```

## Webhook subscription
Configured in `src/app/webhooks/webhooks-hsmeta.json` as a separate `"type": "webhooks"` component (NOT inside app-hsmeta.json — that will fail validation).
- Subscribes to `deal.propertyChange` on `dealstage` (under `legacyCrmObjects`)
- Target URL: `https://hubspot-gong-app-production.up.railway.app/webhook`

## OAuth install URL
```
https://app.hubspot.com/oauth/authorize?client_id=ec8487d8-b3d5-49a9-a7af-dda88d0303ee&redirect_uri=https%3A%2F%2Fhubspot-gong-app-production.up.railway.app%2Foauth-callback&scope=crm.objects.deals.read%20oauth
```
**Status: not working as of 2026-03-22** — returns "invalid app client_id". Root cause unknown. Needs investigation.

## Deploying
```bash
cd packages/ui-extension
hs project upload
```
Auto-deploys to Railway on `git push origin main`.

## Auth
- Auth type: `oauth`, private distribution
- Redirect URL: `https://hubspot-gong-app-production.up.railway.app/oauth-callback`
- Required scopes: `crm.objects.deals.read`, `oauth`

## Backend env vars (Railway)
See `packages/backend/.env.example`. Key vars:
- `HUBSPOT_CLIENT_SECRET` — for verifying webhook signatures
- `CLOSED_WON_STAGE_ID` — internal deal stage value for Closed Won (default: `closedwon`)
