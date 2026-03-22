/**
 * GongCard — HubSpot UI Extension (React)
 *
 * Renders in the Deal record sidebar. Polls the Railway backend every 2.5 s
 * and plays a synthesised gong via the Web Audio API when a Closed Won event
 * arrives for this portal.
 *
 * IMPORTANT: replace BACKEND_URL with your Railway deployment URL before
 * running `hs project deploy`.
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
// Configuration — set this after deploying the backend to Railway
// ---------------------------------------------------------------------------
const BACKEND_URL = 'https://your-app.railway.app'; // ← replace me
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
// Component
// ---------------------------------------------------------------------------

hubspot.extend(({ context }) => <GongCard context={context} />);

function GongCard({ context }) {
  const { portalId } = context;

  // Timestamp of the last event we've already processed; starts just before
  // mount so we don't replay events from the past.
  const lastSeenRef = useRef(Date.now() - 5_000);

  const [status, setStatus] = useState('Listening for Closed Won…');
  const [lastGongTime, setLastGongTime] = useState(null);
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
      const { events, serverTime } = await res.json();

      if (events && events.length > 0) {
        // Advance the cursor so next poll doesn't replay the same events
        lastSeenRef.current = serverTime ?? Date.now();

        playGong();
        setLastGongTime(new Date().toLocaleTimeString());
        setStatus(`GONG! Deal ${events[0].dealId} moved to Closed Won!`);
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
    // First click also unlocks the AudioContext for future auto-plays
    if (!audioUnlocked) setAudioUnlocked(true);
    playGong();
    setStatus('Test gong played!');
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
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

      <Text>{status}</Text>

      {lastGongTime && (
        <Text variant="microcopy">Last gong: {lastGongTime}</Text>
      )}

      <Button onClick={handleTestGong} variant="secondary" size="small">
        Test Gong
      </Button>
    </Flex>
  );
}
