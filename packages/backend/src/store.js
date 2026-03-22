/**
 * In-memory event store.
 * Events are keyed by portalId and expire after EVENT_TTL_MS.
 * Clients use timestamp-based polling so multiple tabs all hear the gong.
 */

const EVENT_TTL_MS = 60_000; // 60 seconds
const store = new Map(); // portalId (string) → Array<{ timestamp, dealId, stage }>

function addEvent(portalId, dealId, stage) {
  const key = String(portalId);
  const list = store.get(key) ?? [];
  list.push({ timestamp: Date.now(), dealId: String(dealId), stage });
  store.set(key, list);
}

function getEventsSince(portalId, since) {
  const key = String(portalId);
  const list = store.get(key) ?? [];
  const cutoff = Date.now() - EVENT_TTL_MS;
  return list.filter((e) => e.timestamp > since && e.timestamp > cutoff);
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

module.exports = { addEvent, getEventsSince };
