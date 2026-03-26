/**
 * GongCard — HubSpot UI Extension (React)
 *
 * Renders in the Deal record sidebar. Polls the Railway backend every 2.5 s
 * and plays a synthesised gong via the Web Audio API when a Closed Won event
 * arrives for this portal. Shows deal name, value, and today's win stats.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  hubspot,
  Text,
  Button,
  Flex,
  Divider,
  Alert,
} from '@hubspot/ui-extensions';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const BACKEND_URL = 'https://hubspot-gong-app-production.up.railway.app';
const POLL_INTERVAL_MS = 2500;

// ---------------------------------------------------------------------------
// Web Audio gong synthesiser
// ---------------------------------------------------------------------------

/** Lazily created, shared AudioContext (one per page). */
let _ctx = null;

function getAudioContext() {
  if (!_ctx) {
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) return null;
    _ctx = new Constructor();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') {
    _ctx.resume();
  }
  return _ctx;
}

/**
 * Synthesise a gong using inharmonic sine partials with exponential decay.
 * Partials are tuned to approximate the overtone series of a large bronze gong.
 */
function playGong() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const partials = [
      { freq: 80,  gainAmt: 1.0,  decay: 4.5 },
      { freq: 205, gainAmt: 0.65, decay: 4.0 },
      { freq: 385, gainAmt: 0.45, decay: 3.2 },
      { freq: 530, gainAmt: 0.30, decay: 2.5 },
      { freq: 715, gainAmt: 0.20, decay: 2.0 },
      { freq: 960, gainAmt: 0.12, decay: 1.5 },
    ];

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.75, ctx.currentTime);
    master.connect(ctx.destination);

    partials.forEach(({ freq, gainAmt, decay }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Sharp attack, long exponential tail
      gainNode.gain.setValueAtTime(gainAmt, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay);

      osc.connect(gainNode);
      gainNode.connect(master);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + decay);
    });
  } catch (err) {
    console.error('[GongCard] Web Audio error:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount) {
  if (amount == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

hubspot.extend(({ context }) => <GongCard context={context} />);

function GongCard({ context }) {
  const { portalId } = context;

  // Timestamp of the last event we've already processed; starts just before
  // mount so we don't replay events from the past.
  const lastSeenRef = useRef(Date.now() - 5_000);

  const [lastEvent, setLastEvent] = useState(null);   // { dealId, dealName, dealAmount, time }
  const [dailyStats, setDailyStats] = useState({ count: 0, totalValue: 0 });
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pollError, setPollError] = useState(false);

  // ------------------------------------------------------------------
  // Polling
  // ------------------------------------------------------------------
  const poll = useCallback(async () => {
    try {
      const url = `${BACKEND_URL}/poll?portalId=${encodeURIComponent(portalId)}&since=${lastSeenRef.current}`;
      const res = await fetch(url, { cache: 'no-store' });

      if (!res.ok) {
        setPollError(true);
        return;
      }

      setPollError(false);
      const { events, dailyStats: stats, serverTime } = await res.json();

      if (stats) setDailyStats(stats);

      if (events && events.length > 0) {
        lastSeenRef.current = serverTime ?? Date.now();
        const latest = events[events.length - 1];

        playGong();
        setLastEvent({
          dealId: latest.dealId,
          dealName: latest.dealName,
          dealAmount: latest.dealAmount,
          time: new Date().toLocaleTimeString(),
        });
      }
    } catch {
      setPollError(true);
    }
  }, [portalId]);

  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [poll]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  function handleTestGong() {
    if (!audioUnlocked) setAudioUnlocked(true);
    playGong();
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const hasStats = dailyStats.count > 0;

  return (
    <Flex direction="column" gap="small">
      <Text format={{ fontWeight: 'bold', fontSize: 'md' }}>
        Gong for HubSpot
      </Text>

      <Divider />

      {!audioUnlocked && (
        <Alert title="Action required" variant="warning">
          Click "Test Gong" once to unlock audio in this tab. After that, the
          gong will play automatically when a deal is won.
        </Alert>
      )}

      {pollError && (
        <Alert title="Connection issue" variant="error">
          Cannot reach the Gong backend. Check that the Railway service is
          running and BACKEND_URL is correct.
        </Alert>
      )}

      {lastEvent ? (
        <Flex direction="column" gap="extra-small">
          <Text format={{ fontWeight: 'bold' }}>
            GONG! {lastEvent.dealName ?? `Deal ${lastEvent.dealId}`} closed!
          </Text>
          {lastEvent.dealAmount != null && (
            <Text>{formatCurrency(lastEvent.dealAmount)}</Text>
          )}
          <Text variant="microcopy">at {lastEvent.time}</Text>
        </Flex>
      ) : (
        <Text>Listening for Closed Won…</Text>
      )}

      {hasStats && (
        <>
          <Divider />
          <Flex direction="column" gap="extra-small">
            <Text format={{ fontWeight: 'bold' }}>Today's wins</Text>
            <Text>
              {dailyStats.count} deal{dailyStats.count !== 1 ? 's' : ''}
              {dailyStats.totalValue > 0
                ? ` · ${formatCurrency(dailyStats.totalValue)}`
                : ''}
            </Text>
          </Flex>
        </>
      )}

      <Divider />

      <Button onClick={handleTestGong} variant="secondary" size="small">
        Test Gong
      </Button>
    </Flex>
  );
}
