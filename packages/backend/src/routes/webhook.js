const { Router } = require('express');
const crypto = require('crypto');
const { addEvent } = require('../store');

const router = Router();

const CLOSED_WON_STAGE_ID = process.env.CLOSED_WON_STAGE_ID || 'closedwon';
const CLIENT_SECRET = process.env.HUBSPOT_CLIENT_SECRET;

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

/**
 * POST /webhook
 * Receives HubSpot webhook v4 subscription events (JSON array).
 */
router.post('/', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[webhook] Invalid signature — rejected');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let events = req.body;
  if (!Array.isArray(events)) events = [events];

  for (const event of events) {
    const { subscriptionType, portalId, objectId, propertyName, propertyValue } = event;

    if (
      subscriptionType === 'deal.propertyChange' &&
      propertyName === 'dealstage' &&
      propertyValue === CLOSED_WON_STAGE_ID
    ) {
      addEvent(portalId, objectId, propertyValue);
      console.log(`[GONG] Portal ${portalId} · Deal ${objectId} → Closed Won`);
    }
  }

  res.json({ received: true });
});

module.exports = router;
