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

// 1. Auth0 Fine-Grained Authorization (FGA) Store
// Defines User-to-Role and Object-to-Role Tuples
const fgaTuples = [
  // User Role Assignments
  { user: "user:shivankar", relation: "has_role", object: "role:manager" },
  { user: "user:alice", relation: "has_role", object: "role:manager" },
  { user: "user:bob", relation: "has_role", object: "role:employee" },

  // Document Access Control Policies
  { user: "role:manager", relation: "can_view", object: "doc:executive_salaries_2026" },
  { user: "role:manager", relation: "can_view", object: "doc:engineering_architecture_roadmap" },
  { user: "role:employee", relation: "can_view", object: "doc:engineering_architecture_roadmap" },
  { user: "role:employee", relation: "can_view", object: "doc:standard_leave_policy" }
];

// Document Knowledge Store (RAG Corpus)
const documentCorpus = [
  {
    id: "doc:executive_salaries_2026",
    title: "Executive & Engineering Salary Compensation Bands 2026",
    classification: "STRICTLY_CONFIDENTIAL",
    allowedRoles: ["role:manager"],
    snippet: "CONFIDENTIAL: L5 Staff Engineer: $190,000 - $240,000. Engineering Director: $260,000 - $320,000 + 20% bonus."
  },
  {
    id: "doc:engineering_architecture_roadmap",
    title: "Platform Core Architecture & Scalability Roadmap",
    classification: "INTERNAL_ENGINEERING",
    allowedRoles: ["role:manager", "role:employee"],
    snippet: "Platform Core Architecture: Microservices event-driven bus migrating to Kafka with Auth0 JWT edge validation."
  },
  {
    id: "doc:standard_leave_policy",
    title: "Global Employee Leave & Wellness Policy",
    classification: "GENERAL_INTERNAL",
    allowedRoles: ["role:manager", "role:employee"],
    snippet: "Full-time employees receive 24 days paid time off annually, plus public holidays and health coverage."
  }
];

// Simulated Auth0 FGA Relationship Check Evaluation
function checkFGA(user, relation, object) {
  // Check direct tuple match
  const directMatch = fgaTuples.some(t => t.user === user && t.relation === relation && t.object === object);
  if (directMatch) return true;

  // Resolve user roles, then verify role-to-object permissions
  const userRoles = fgaTuples
    .filter(t => t.user === user && t.relation === "has_role")
    .map(t => t.object);

  return userRoles.some(role =>
    fgaTuples.some(t => t.user === role && t.relation === relation && t.object === object)
  );
}

// RAG Retrieval Endpoint Protected by Auth0 FGA
app.post('/api/rag/query', requiresAuth(), (req, res) => {
  const { query, simulateRole } = req.body;
  const authEmail = req.oidc.user.email || 'shivankar@test.com';

  // Allow switching personas to test manager vs employee evaluation
  const effectiveUser = simulateRole === 'employee' ? 'user:bob' : 'user:shivankar';
  const assignedRole = simulateRole === 'employee' ? 'role:employee' : 'role:manager';

  // Step 1: Semantic search / index lookup (matches potential documents)
  const candidateDocs = query.toLowerCase().includes('salar') || query.toLowerCase().includes('comp')
    ? [documentCorpus[0]]
    : query.toLowerCase().includes('arch')
      ? [documentCorpus[1]]
      : documentCorpus;

  // Step 2: Auth0 FGA Pre-Retrieval Enforcement
  const authorizedDocs = [];
  const deniedDocs = [];

  candidateDocs.forEach(doc => {
    const isAllowed = checkFGA(effectiveUser, "can_view", doc.id);
    if (isAllowed) {
      authorizedDocs.push(doc);
    } else {
      deniedDocs.push({
        id: doc.id,
        title: doc.title,
        reason: `FGA Policy Violation: User [${effectiveUser}] lacks relation [can_view] for [${doc.id}]`
      });
    }
  });

  // Step 3: LLM Generation based strictly on authorized context
  if (authorizedDocs.length === 0) {
    return res.json({
      status: 'DENIED',
      query,
      userContext: { effectiveUser, assignedRole, authEmail },
      deniedDocuments: deniedDocs,
      ragAnswer: `Access Denied: The authenticated identity does not possess Fine-Grained Authorization (FGA) permissions to retrieve the relevant documents for "${query}". No context was ingested.`
    });
  }

  const combinedContext = authorizedDocs.map(d => d.snippet).join('\n');
  res.json({
    status: 'AUTHORIZED',
    query,
    userContext: { effectiveUser, assignedRole, authEmail },
    authorizedDocuments: authorizedDocs.map(d => ({ id: d.id, title: d.title })),
    deniedDocuments: deniedDocs,
    retrievedContextSnippet: combinedContext,
    ragAnswer: `Retrieved securely via FGA: ${combinedContext}`
  });
});

// UI
app.get('/', (req, res) => {
  const loggedIn = req.oidc.isAuthenticated();
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Auth0 FGA Privacy-Aware RAG Bot</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1120; color: #f8fafc; margin: 0; padding: 40px 20px; }
          .container { max-width: 820px; margin: 0 auto; background: #1e293b; border-radius: 12px; padding: 32px; border: 1px solid #334155; }
          h1 { margin-top: 0; color: #38bdf8; font-size: 1.6rem; }
          button { background: #6366f1; color: white; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
          button:hover { background: #4f46e5; }
          .card { background: #0f172a; border-radius: 8px; padding: 20px; margin-top: 20px; border: 1px solid #334155; }
          pre { background: #020617; padding: 12px; border-radius: 6px; overflow-x: auto; color: #a5f3fc; font-size: 0.85rem; }
          .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; background: #22c55e; color: #022c22; font-weight: bold; }
          .test-btn { background: #334155; margin-right: 8px; padding: 8px 12px; font-size: 0.85rem; border: 1px solid #475569; }
          select { background: #020617; color: white; padding: 8px; border-radius: 6px; border: 1px solid #475569; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Auth0 FGA Privacy-Aware RAG Bot</h1>
          <p>Enforcing Fine-Grained Authorization (ReBAC) at the vector and document level prior to model ingestion.</p>
          ${
            loggedIn
              ? `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <span class="badge">Session Active</span>
                    <p style="margin: 6px 0 0 0;">Authenticated: <b>${req.oidc.user.name || req.oidc.user.email}</b></p>
                  </div>
                  <a href="/logout"><button style="background: #ef4444;">Log Out</button></a>
                </div>

                <div class="card">
                  <h3>Knowledge Query Console</h3>
                  <div style="margin-bottom: 12px;">
                    <label><strong>Simulate Persona:</strong> </label>
                    <select id="personaSelect">
                      <option value="manager">Shivankar (Role: Manager) - Authorized for Salaries</option>
                      <option value="employee">Bob (Role: Employee) - Denied for Salaries</option>
                    </select>
                  </div>

                  <div style="margin-bottom: 12px;">
                    <button class="test-btn" onclick="setQuery('What are the executive salary compensation bands for 2026?')">Query: Executive Salaries (Sensitive)</button>
                    <button class="test-btn" onclick="setQuery('Explain the platform architecture roadmap')">Query: Architecture (General Internal)</button>
                  </div>

                  <div style="display: flex; gap: 8px;">
                    <input id="queryInput" type="text" style="flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #475569; background: #020617; color: white;" value="What are the executive salary compensation bands for 2026?" />
                    <button onclick="runRAG()">Submit Query</button>
                  </div>
                  <div id="output" style="margin-top: 18px;"></div>
                </div>

                <script>
                  function setQuery(q) {
                    document.getElementById('queryInput').value = q;
                  }

                  async function runRAG() {
                    const out = document.getElementById('output');
                    const q = document.getElementById('queryInput').value;
                    const persona = document.getElementById('personaSelect').value;
                    out.innerHTML = '<em>Running FGA policy relationship checks on candidate vector documents...</em>';

                    const res = await fetch('/api/rag/query', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ query: q, simulateRole: persona })
                    });
                    const data = await res.json();

                    if (data.status === 'DENIED') {
                      out.innerHTML = \`
                        <div style="border: 1px solid #ef4444; padding: 14px; border-radius: 6px; background: rgba(239, 68, 68, 0.08);">
                          <h4 style="color: #f87171; margin-top:0;">?? 403 FGA Access Denied</h4>
                          <p>\${data.ragAnswer}</p>
                          <p style="font-size: 0.85rem; color: #cbd5e1;">Sensitive documents were filtered out prior to LLM synthesis to prevent data leakage.</p>
                        </div>
                        <h4>FGA Audit Payload:</h4>
                        <pre>\${JSON.stringify(data, null, 2)}</pre>
                      \`;
                    } else {
                      out.innerHTML = \`
                        <div style="border: 1px solid #10b981; padding: 14px; border-radius: 6px; background: rgba(16, 185, 129, 0.08);">
                          <h4 style="color: #34d399; margin-top:0;">? Authorized RAG Response</h4>
                          <p>\${data.ragAnswer}</p>
                        </div>
                        <h4>FGA Audit Payload:</h4>
                        <pre>\${JSON.stringify(data, null, 2)}</pre>
                      \`;
                    }
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
