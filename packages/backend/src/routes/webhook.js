const { Router } = require('express');
const crypto = require('crypto');
const https = require('https');
const { addEvent } = require('../store');

const router = Router();

const CLOSED_WON_STAGE_ID = process.env.CLOSED_WON_STAGE_ID || 'closedwon';
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify HubSpot webhook v3 signature.
 * https://developers.hubspot.com/docs/api/webhooks/validating-requests-v3
 *
 * If CLIENT_SECRET is not set the check is skipped (dev convenience).
 */
function verifySignature(req) {
  if (!CLIENT_SECRET) return true;

  const signature = req.headers['x-hubspot-signature-v3'];
  const timestamp = req.headers['x-hubspot-request-timestamp'];

  if (!signature || !timestamp) return false;

  // Reject if timestamp is more than 5 minutes old
  if (Math.abs(Date.now() - Number(timestamp)) > 300_000) return false;

  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const fullUrl = `${protocol}://${req.headers.host}${req.originalUrl}`;
  const toSign = `POST${fullUrl}${req.rawBody}${timestamp}`;

  const expected = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(toSign)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HubSpot API — fetch deal properties
// ---------------------------------------------------------------------------

/**
 * Fetch dealname and amount for a deal from the HubSpot CRM API.
 * Requires HUBSPOT_ACCESS_TOKEN to be set; silently returns {} otherwise.
 */
function fetchDealProperties(dealId) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) return Promise.resolve({});

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.hubapi.com',
      path: `/crm/v3/objects/deals/${dealId}?properties=dealname,amount`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve(body.properties ?? {});
        } catch {
          resolve({});
        }
      });
    });

    req.on('error', () => resolve({}));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Slack notification
// ---------------------------------------------------------------------------

/**
 * POST a Closed Won notification to Slack.
 * Requires SLACK_WEBHOOK_URL to be set; silently no-ops otherwise.
 */
function notifySlack(dealName, dealAmount, dealId) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  let text = '*GONG!* ';
  if (dealName) {
    text += `Deal *"${dealName}"*`;
    if (dealAmount) text += ` ($${Number(dealAmount).toLocaleString()})`;
    text += ' just closed! ';
  } else {
    text += `Deal ${dealId} just closed! `;
  }
  text += ':tada:';

  try {
    const parsed = new URL(webhookUrl);
    const body = JSON.stringify({ text });

    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = (parsed.protocol === 'https:' ? https : require('http')).request(options);
    req.on('error', (err) => console.warn('[slack] notification failed:', err.message));
    req.write(body);
    req.end();
  } catch (err) {
    console.warn('[slack] invalid webhook URL:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * POST /webhook
 * Receives HubSpot webhook v4 subscription events (JSON array).
 */
router.post('/', async (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[webhook] Invalid signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Acknowledge immediately so HubSpot doesn't retry
  res.json({ received: true });

  let events = req.body;
  if (!Array.isArray(events)) events = [events];

  for (const event of events) {
    const { subscriptionType, portalId, objectId, propertyName, propertyValue } = event;

    if (
      subscriptionType === 'deal.propertyChange' &&
      propertyName === 'dealstage' &&
      propertyValue === CLOSED_WON_STAGE_ID
    ) {
      // Fetch deal details asynchronously — don't block the webhook response
      const props = await fetchDealProperties(objectId);
      const dealName = props.dealname ?? null;
      const dealAmount = props.amount ? parseFloat(props.amount) : null;

      addEvent(portalId, objectId, propertyValue, dealName, dealAmount);
      notifySlack(dealName, dealAmount, objectId);

      console.log(
        `[GONG] Portal ${portalId} · Deal ${objectId}${dealName ? ` "${dealName}"` : ''}${dealAmount ? ` $${dealAmount}` : ''} → Closed Won`
      );
    }
  }
});

module.exports = router;
