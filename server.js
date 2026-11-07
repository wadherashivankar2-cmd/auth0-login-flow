require('dotenv').config();
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');

const app = express();
app.use(express.json());

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET,
  baseURL: process.env.BASE_URL,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.ISSUER_BASE_URL
};

app.use(auth(config));

// In-memory First-Party User Profile / Settings store
const userPreferencesDB = {
  default: {
    city: 'Bengaluru',
    latitude: 12.9716,
    longitude: 77.5946,
    timezone: 'Asia/Kolkata',
    role: 'Engineer',
    preferredUnits: 'celsius'
  }
};

// 1. First-Party API: Retrieves user preference profile based on authenticated identity
app.get('/api/user/preferences', requiresAuth(), (req, res) => {
  const userId = req.oidc.user.sub;
  const preferences = userPreferencesDB[userId] || userPreferencesDB['default'];
  res.json({
    userId,
    userName: req.oidc.user.name || req.oidc.user.email,
    preferences
  });
});

// 2. Assistant Endpoint: Chains First-Party User Context with Third-Party API
app.get('/api/assistant/briefing', requiresAuth(), async (req, res) => {
  try {
    const userId = req.oidc.user.sub;
    const userName = req.oidc.user.name || req.oidc.user.email;
    const prefs = userPreferencesDB[userId] || userPreferencesDB['default'];

    // Call Public 3rd-Party API (Open-Meteo) using context gathered from 1st-party profile
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${prefs.latitude}&longitude=${prefs.longitude}&current_weather=true`;
    const weatherResponse = await fetch(weatherUrl);
    const weatherData = await weatherResponse.json();

    res.json({
      status: 'success',
      authenticatedContext: {
        userId,
        userName,
        authProvider: req.oidc.user.sub.split('|')[0]
      },
      firstPartyProfile: prefs,
      thirdPartyData: {
        source: 'Open-Meteo Public Weather API',
        temperature: `${weatherData.current_weather.temperature} °C`,
        windspeed: `${weatherData.current_weather.windspeed} km/h`,
        time: weatherData.current_weather.time
      },
      assistantMessage: `Hello ${userName}! Based on your internal profile settings for ${prefs.city}, current conditions are ${weatherData.current_weather.temperature} °C with winds at ${weatherData.current_weather.windspeed} km/h.`
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate assistant briefing', details: error.message });
  }
});

// UI: Dashboard with Assistant Briefing Card
app.get('/', (req, res) => {
  const loggedIn = req.oidc.isAuthenticated();
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Context-Preserving Assistant</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; }
          .container { max-width: 720px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }
          h1 { margin-top: 0; font-size: 1.6rem; color: #38bdf8; }
          button { background: #6366f1; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
          button:hover { background: #4f46e5; }
          .card { background: #0f172a; border-radius: 8px; padding: 20px; margin-top: 20px; border: 1px solid #334155; }
          pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #a5f3fc; font-size: 0.85rem; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: #22c55e; color: #022c22; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Identity-Aware Personal Assistant</h1>
          <p>Full-stack context preservation across Auth0 Universal Login, 1st-Party APIs, and 3rd-Party endpoints.</p>
          ${
            loggedIn
              ? `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="badge">Authenticated</span>
                    <p>Session user: <b>${req.oidc.user.name || req.oidc.user.email}</b></p>
                  </div>
                  <a href="/logout"><button style="background: #ef4444;">Log Out</button></a>
                </div>
                <div class="card">
                  <h3>Agent Dispatch</h3>
                  <button onclick="fetchBriefing()">Run Assistant Briefing Pipeline</button>
                  <div id="output" style="margin-top: 16px;"></div>
                </div>
                <script>
                  async function fetchBriefing() {
                    const out = document.getElementById('output');
                    out.innerHTML = '<em>Resolving authenticated session, 1st-party preferences, and 3rd-party weather telemetry...</em>';
                    const res = await fetch('/api/assistant/briefing');
                    const data = await res.json();
                    out.innerHTML = '<h4>Assistant Response:</h4><p style="color: #38bdf8; font-weight: bold;">' + data.assistantMessage + '</p><h4>Preserved Context Payload:</h4><pre>' + JSON.stringify(data, null, 2) + '</pre>';
                  }
                </script>
              `
              : `
                <p>Status: Logged Out</p>
                <a href="/login"><button>Log In with Auth0</button></a>
              `
          }
        </div>
      </body>
    </html>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
