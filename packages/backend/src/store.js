/**
 * In-memory event store.
 * Events are keyed by portalId and expire after EVENT_TTL_MS.
 * Clients use timestamp-based polling so multiple tabs all hear the gong.
 *
 * Also tracks daily stats (win count + total deal value) per portal,
 * resetting automatically at midnight.
 */

const EVENT_TTL_MS = 60_000; // 60 seconds

/** portalId (string) → Array<{ timestamp, dealId, stage, dealName, dealAmount }> */
const store = new Map();

/** portalId (string) → { date: 'YYYY-MM-DD', count: number, totalValue: number } */
const dailyStats = new Map();

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addEvent(portalId, dealId, stage, dealName = null, dealAmount = null) {
  const key = String(portalId);

  // Append event
  const list = store.get(key) ?? [];
  list.push({
    timestamp: Date.now(),
    dealId: String(dealId),
    stage,
    dealName,
    dealAmount,
  });
  store.set(key, list);

  // Update daily stats, resetting if the date has rolled over
  const today = getTodayDate();
  const stats = dailyStats.get(key);
  if (!stats || stats.date !== today) {
    dailyStats.set(key, { date: today, count: 1, totalValue: dealAmount ?? 0 });
  } else {
    stats.count += 1;
    stats.totalValue += dealAmount ?? 0;
  }
}

function getEventsSince(portalId, since) {
  const key = String(portalId);
  const list = store.get(key) ?? [];
  const cutoff = Date.now() - EVENT_TTL_MS;
  return list.filter((e) => e.timestamp > since && e.timestamp > cutoff);
}

function getDailyStats(portalId) {
  const key = String(portalId);
  const stats = dailyStats.get(key);
  const today = getTodayDate();
  if (!stats || stats.date !== today) return { count: 0, totalValue: 0 };
  return { count: stats.count, totalValue: stats.totalValue };
}

// Prune old events every 30 s to avoid unbounded growth
setInterval(() => {
  const cutoff = Date.now() - EVENT_TTL_MS;
  for (const [key, list] of store.entries()) {
    const fresh = list.filter((e) => e.timestamp > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
  }
}, 30_000);

module.exports = { addEvent, getEventsSince, getDailyStats };
