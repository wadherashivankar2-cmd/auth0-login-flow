require('dotenv').config();
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET,
  baseURL: process.env.BASE_URL,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.ISSUER_BASE_URL
};

app.use(auth(config));

// 1. Simulated Secure Token Vault
const tokenVault = {
  tokens: new Map(),
  getToken(userId, provider) {
    return this.tokens.get(`${userId}:${provider}`) || {
      token: `vault_sec_${crypto.randomBytes(16).toString('hex')}`,
      scopes: ['read:data', 'admin:repo_delete', 'send:privileged_comms'],
      provider
    };
  }
};

// 2. In-Memory Store for CIBA / Asynchronous Authorization Requests
const pendingApprovals = new Map();

function analyzeRisk(action) {
  const highRiskPatterns = [
    /delete.*repo/i,
    /drop.*database/i,
    /deploy.*prod/i,
    /email.*ceo/i,
    /purge.*logs/i
  ];
  return highRiskPatterns.some((pattern) => pattern.test(action));
}

// Low-Risk Read API
app.get('/api/agent/status', requiresAuth(), (req, res) => {
  const userId = req.oidc.user.sub;
  const vaultItem = tokenVault.getToken(userId, 'github');
  res.json({
    status: 'online',
    delegatedProvider: vaultItem.provider,
    scopes: vaultItem.scopes,
    syncSummary: 'Fetched 12 recent commits, 3 pull requests, 0 system alerts.'
  });
});

// Action Execution Endpoint
app.post('/api/agent/dispatch', requiresAuth(), (req, res) => {
  const { command } = req.body;
  const userId = req.oidc.user.sub;
  const userEmail = req.oidc.user.email || 'developer@sjbit.edu.in';
  const isHighImpact = analyzeRisk(command);

  if (!isHighImpact) {
    return res.json({
      status: 'EXECUTED',
      highImpact: false,
      command,
      result: `Safe task executed directly: "${command}". Third-party telemetry logged.`
    });
  }

  const authReqId = `ciba_req_${crypto.randomBytes(12).toString('hex')}`;
  const approvalRecord = {
    authReqId,
    userId,
    userEmail,
    command,
    status: 'PENDING_APPROVAL',
    createdAt: new Date().toISOString()
  };

  pendingApprovals.set(authReqId, approvalRecord);

  res.json({
    status: 'HALTED_FOR_APPROVAL',
    highImpact: true,
    authReqId,
    command,
    message: 'High-impact action detected. Agent execution paused. Asynchronous out-of-band authorization dispatched.',
    verificationChannel: `Email/Push sent to ${userEmail}`,
    approvalUrl: `${process.env.BASE_URL}/veto/approval?reqId=${authReqId}`
  });
});

// Polling Endpoint
app.get('/api/agent/poll-status/:reqId', requiresAuth(), (req, res) => {
  const { reqId } = req.params;
  const record = pendingApprovals.get(reqId);
  if (!record) {
    return res.status(404).json({ error: 'Authorization request not found or expired' });
  }
  res.json(record);
});

// Out-of-band Approval Endpoint
app.get('/veto/approval', (req, res) => {
  const { reqId } = req.query;
  const record = pendingApprovals.get(reqId);

  if (!record) {
    return res.send(`<h2>Authorization expired or invalid.</h2>`);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Auth0 CIBA Asynchronous Verification</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f8fafc; padding: 40px 20px; }
          .card { max-width: 580px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 28px; border: 1px solid #334155; }
          .warning { color: #f87171; font-weight: bold; }
          .btn-approve { background: #10b981; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; margin-right: 10px; }
          .btn-reject { background: #ef4444; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2 style="margin-top:0;">?? Out-of-Band Action Authorization (CIBA)</h2>
          <p>An autonomous agent operating under session identity <b>${record.userEmail}</b> has attempted an administrative action:</p>
          <div style="background: #020617; padding: 12px; border-radius: 6px; border-left: 4px solid #ef4444; margin: 16px 0;">
            <span class="warning">High-Impact Action:</span>
            <div style="margin-top: 6px; font-family: monospace; color: #fef08a;">${record.command}</div>
          </div>
          <p>Target Request ID: <code>${record.authReqId}</code></p>
          <form method="POST" action="/veto/resolve">
            <input type="hidden" name="authReqId" value="${record.authReqId}" />
            <button type="submit" name="decision" value="APPROVED" class="btn-approve">Approve Execution</button>
            <button type="submit" name="decision" value="REJECTED" class="btn-reject">Veto & Reject</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// Decision Resolver
app.post('/veto/resolve', (req, res) => {
  const { authReqId, decision } = req.body;
  const record = pendingApprovals.get(authReqId);
  if (!record) {
    return res.status(404).send('Request not found or expired.');
  }

  record.status = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  record.resolvedAt = new Date().toISOString();
  pendingApprovals.set(authReqId, record);

  res.send(`
    <div style="font-family: sans-serif; text-align: center; margin-top: 60px; color: #1e293b;">
      <h2>Decision Recorded: ${record.status}</h2>
      <p>The agent session poll will now receive this out-of-band verification token.</p>
    </div>
  `);
});

// UI: Dashboard
app.get('/', (req, res) => {
  const loggedIn = req.oidc.isAuthenticated();
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>The Veto Agent | CIBA & Token Vault</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 40px 20px; }
          .container { max-width: 800px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }
          h1 { margin-top: 0; font-size: 1.6rem; color: #38bdf8; }
          button { background: #6366f1; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
          button:hover { background: #4f46e5; }
          .card { background: #0f172a; border-radius: 8px; padding: 20px; margin-top: 20px; border: 1px solid #334155; }
          pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #a5f3fc; font-size: 0.85rem; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: #22c55e; color: #022c22; font-weight: bold; }
          .status-halted { color: #facc15; font-weight: bold; }
          .status-approved { color: #4ade80; font-weight: bold; }
          .cmd-btn { background: #334155; margin-right: 8px; font-size: 0.85rem; padding: 6px 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>The Veto Agent Console</h1>
          <p>Asynchronous CIBA Authorization & Delegated Token Vault Protection.</p>
          ${
            loggedIn
              ? `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="badge">Session Active</span>
                    <p style="margin: 6px 0 0 0;">Agent Operator: <b>${req.oidc.user.name || req.oidc.user.email}</b></p>
                  </div>
                  <a href="/logout"><button style="background: #ef4444;">Log Out</button></a>
                </div>

                <div class="card">
                  <h3>Agent Action Terminal</h3>
                  <p style="font-size: 0.9rem; color: #94a3b8;">Trigger a routine query or a high-impact task to test the CIBA Veto interceptor:</p>
                  <div style="margin-bottom: 14px;">
                    <button class="cmd-btn" onclick="setCommand('Fetch repo sync telemetry')">Routine: Sync Telemetry</button>
                    <button class="cmd-btn" style="border: 1px solid #f87171;" onclick="setCommand('Delete production repo wadherashivankar2-cmd/prod-core')">High Impact: Delete Production Repo</button>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <input id="commandInput" type="text" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #020617; color: white;" value="Delete production repo wadherashivankar2-cmd/prod-core" />
                    <button onclick="dispatchAgent()">Dispatch Task</button>
                  </div>
                  <div id="output" style="margin-top: 18px;"></div>
                </div>

                <script>
                  function setCommand(cmd) {
                    document.getElementById('commandInput').value = cmd;
                  }

                  let pollInterval = null;

                  async function dispatchAgent() {
                    clearInterval(pollInterval);
                    const cmd = document.getElementById('commandInput').value;
                    const out = document.getElementById('output');
                    out.innerHTML = '<em>Agent evaluating task sensitivity and Token Vault credentials...</em>';

                    const res = await fetch('/api/agent/dispatch', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ command: cmd })
                    });
                    const data = await res.json();

                    if (data.status === 'HALTED_FOR_APPROVAL') {
                      out.innerHTML = \`
                        <div style="border: 1px solid #facc15; padding: 14px; border-radius: 6px; background: rgba(250, 204, 21, 0.05);">
                          <p class="status-halted">?? EXECUTION HALTED (CIBA Out-of-Band Check Triggered)</p>
                          <p style="font-size: 0.9rem;">\${data.message}</p>
                          <p><strong>Channel:</strong> \${data.verificationChannel}</p>
                          <p><strong>Simulate Push Link:</strong> <a href="\${data.approvalUrl}" target="_blank" style="color: #38bdf8;">Open Approval Page</a></p>
                          <div id="pollDisplay"><em>Polling for backchannel authorization decision...</em></div>
                        </div>
                        <h4>Initial Dispatch Payload:</h4>
                        <pre>\${JSON.stringify(data, null, 2)}</pre>
                      \`;
                      startPolling(data.authReqId);
                    } else {
                      out.innerHTML = \`
                        <div style="border: 1px solid #4ade80; padding: 14px; border-radius: 6px; background: rgba(74, 222, 128, 0.05);">
                          <p class="status-approved">? \${data.status}</p>
                          <p>\${data.result}</p>
                        </div>
                        <h4>Response:</h4>
                        <pre>\${JSON.stringify(data, null, 2)}</pre>
                      \`;
                    }
                  }

                  function startPolling(reqId) {
                    pollInterval = setInterval(async () => {
                      const res = await fetch('/api/agent/poll-status/' + reqId);
                      const state = await res.json();
                      const pollDisplay = document.getElementById('pollDisplay');
                      if (state.status === 'APPROVED') {
                        clearInterval(pollInterval);
                        pollDisplay.innerHTML = '<span class="status-approved">?? APPROVED: Out-of-band authorization verified! High-impact task executed securely with Token Vault scopes.</span>';
                      } else if (state.status === 'REJECTED') {
                        clearInterval(pollInterval);
                        pollDisplay.innerHTML = '<span style="color: #ef4444; font-weight: bold;">? REJECTED: User exercised VETO out-of-band. Action permanently aborted.</span>';
                      }
                    }, 2000);
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
