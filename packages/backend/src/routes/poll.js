const { Router } = require('express');
const { getEventsSince } = require('../store');

const router = Router();

/**
 * GET /poll?portalId=<id>&since=<epoch_ms>
 *
 * Returns all Closed Won events for the given portal newer than `since`.
 * Clients should update their `since` to `serverTime` after each response
 * so they don't re-process the same events.
 */
router.get('/', (req, res) => {
  const { portalId, since } = req.query;

  if (!portalId) {
    return res.status(400).json({ error: 'portalId query param is required' });
  }

  const sinceTs = parseInt(since, 10) || 0;
  const events = getEventsSince(portalId, sinceTs);
  const serverTime = Date.now();

  res.json({ events, serverTime });
});

module.exports = router;
