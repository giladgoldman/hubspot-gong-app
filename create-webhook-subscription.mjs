/**
 * One-off script to create a HubSpot webhook subscription for deal stage changes.
 *
 * No credentials needed — reads the access token directly from the HubSpot CLI
 * config at ~/.hscli/config.yml (the same auth used by `hs project upload`).
 *
 * If you get a 401, run any `hs` command first (e.g. `hs account list`) to
 * refresh the token, then re-run this script.
 *
 * Usage:
 *   node create-webhook-subscription.mjs
 */

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const APP_ID = 34522793;
const TARGET_URL = "https://hubspot-gong-app-production.up.railway.app/webhook";

// Read access token from HubSpot CLI config
function getAccessToken() {
  const configPath = join(homedir(), ".hscli", "config.yml");
  const raw = readFileSync(configPath, "utf8");

  // Extract the accessToken folded scalar value (the line after "accessToken: >-")
  const match = raw.match(/accessToken:\s*>-\s*\n\s+(\S+)/);
  if (!match) throw new Error("Could not find accessToken in " + configPath);

  const token = match[1];

  // Warn if expired
  const expiresMatch = raw.match(/expiresAt:\s*'([^']+)'/);
  if (expiresMatch) {
    const expiresAt = new Date(expiresMatch[1]);
    if (expiresAt < new Date()) {
      console.warn(`Warning: token expired at ${expiresAt.toISOString()}.`);
      console.warn("Run `hs account list` to refresh it, then re-run this script.\n");
    }
  }

  return token;
}

const accessToken = getAccessToken();
const BASE = `https://api.hubapi.com/webhooks/v3/${APP_ID}`;
const HEADERS = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${accessToken}`,
};

// Step 1: Set the target URL for the app's webhook settings
console.log("Setting webhook target URL...");
const settingsRes = await fetch(`${BASE}/settings`, {
  method: "PUT",
  headers: HEADERS,
  body: JSON.stringify({
    targetUrl: TARGET_URL,
    throttling: { period: "SECONDLY", maxConcurrentRequests: 10 },
  }),
});
const settings = await settingsRes.json();
if (!settingsRes.ok) {
  console.error("Failed to set webhook settings:", JSON.stringify(settings, null, 2));
  process.exit(1);
}
console.log("Webhook settings updated:", JSON.stringify(settings, null, 2));

// Step 2: Create the subscription
console.log("\nCreating webhook subscription...");
const subRes = await fetch(`${BASE}/subscriptions`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({
    eventType: "deal.propertyChange",
    propertyName: "dealstage",
    active: true,
  }),
});
const sub = await subRes.json();
if (!subRes.ok) {
  console.error("Failed to create subscription:", JSON.stringify(sub, null, 2));
  process.exit(1);
}
console.log("Subscription created:", JSON.stringify(sub, null, 2));
