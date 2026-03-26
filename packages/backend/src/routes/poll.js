const { Router } = require('express');
const { getEventsSince, getDailyStats } = require('../store');

const router = Router();

// ---------------------------------------------------------------------------
// Rate limiting — max 10 requests per 10 seconds per IP (no extra deps)
// ---------------------------------------------------------------------------
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 10;
const rateLimitMap = new Map(); // ip → { count, resetAt }

// Prune stale entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60_000);

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  if (entry.count >= RATE_MAX) return true;
  entry.count += 1;
  return false;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * GET /poll?portalId=<id>&since=<epoch_ms>
 *
 * Returns all Closed Won events for the given portal newer than `since`,
 * along with today's win count and total deal value.
 * Clients should update their `since` to `serverTime` after each response.
 */
router.get('/', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? req.socket.remoteAddress;

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  const { portalId, since } = req.query;

  if (!portalId) {
    return res.status(400).json({ error: 'portalId query param is required' });
  }

  const sinceTs = parseInt(since, 10) || 0;
  const events = getEventsSince(portalId, sinceTs);
  const dailyStats = getDailyStats(portalId);
  const serverTime = Date.now();

  res.json({ events, dailyStats, serverTime });
});

module.exports = router;
