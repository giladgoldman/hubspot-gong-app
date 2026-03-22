require('dotenv').config();

const express = require('express');
const cors = require('cors');
const webhookRouter = require('./routes/webhook');
const pollRouter = require('./routes/poll');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// CORS — allow requests from HubSpot's CRM iframe origin
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'https://app.hubspot.com',
  'https://app.hubspotqa.com',
];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server, curl, etc.)
      if (!origin) return cb(null, true);
      if (
        ALLOWED_ORIGINS.includes(origin) ||
        origin.endsWith('.hubspot.com') ||
        origin.endsWith('.hubspotqa.com')
      ) {
        return cb(null, true);
      }
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

// ---------------------------------------------------------------------------
// Body parsing — capture rawBody for HubSpot signature verification
// ---------------------------------------------------------------------------
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/webhook', webhookRouter);
app.use('/poll', pollRouter);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Gong backend listening on port ${PORT}`);
});
