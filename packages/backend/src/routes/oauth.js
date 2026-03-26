const { Router } = require('express');
const https = require('https');

const router = Router();

/**
 * GET /oauth-callback
 *
 * HubSpot redirects here after the user authorises the app.
 * Exchanges the one-time code for access + refresh tokens via the HubSpot
 * OAuth API. Set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET in your env.
 */
router.get('/', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.warn(`[oauth] HubSpot returned an error: ${error} — ${error_description}`);
    return res.status(400).send(`
      <h2>Authorisation failed</h2>
      <p>${error_description || error}</p>
    `);
  }

  if (!code) {
    return res.status(400).send('<h2>Missing authorisation code</h2>');
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    // Dev mode — no token exchange configured, just confirm install
    console.log('[oauth] Code received (no client credentials set — skipping token exchange)');
    return res.send(successPage());
  }

  const redirectUri =
    process.env.HUBSPOT_REDIRECT_URI ||
    `https://${req.headers.host}/oauth-callback`;

  try {
    const tokens = await exchangeCode({ code, clientId, clientSecret, redirectUri });
    console.log(`[oauth] Token exchange successful — portal access granted`);

    // For this app the access token is only needed for deal property lookups
    // in webhook.js (HUBSPOT_ACCESS_TOKEN). Log it so the operator can copy
    // it into their Railway env vars if they haven't used a private app token.
    if (tokens.access_token && !process.env.HUBSPOT_ACCESS_TOKEN) {
      console.log('[oauth] access_token received — set HUBSPOT_ACCESS_TOKEN in your env to use it for deal enrichment');
    }

    res.send(successPage());
  } catch (err) {
    console.error('[oauth] Token exchange failed:', err.message);
    res.status(500).send('<h2>Token exchange failed — check server logs</h2>');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString();

    const options = {
      hostname: 'api.hubapi.com',
      path: '/oauth/v1/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error('Invalid JSON from HubSpot token endpoint'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function successPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Gong for HubSpot — Connected!</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f5f8fa; }
    .card { background: white; border-radius: 8px; padding: 40px 48px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.1); text-align: center; }
    h1 { color: #00bda5; margin: 0 0 12px; }
    p  { color: #516f90; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You're all set!</h1>
    <p>Gong for HubSpot is connected. You can close this tab.</p>
  </div>
</body>
</html>`;
}

module.exports = router;
