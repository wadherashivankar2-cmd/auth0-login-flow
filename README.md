# The Privacy-Aware RAG Bot (Auth0 FGA)

An internal knowledge retrieval assistant (RAG) enforcing Fine-Grained Authorization (FGA / ReBAC) at the document level based on user identity, role, and classification before feeding context to an LLM.

## Features & Implementation
1. Auth0 Universal Login: Authenticates users and establishes verified OIDC session identity.
2. Fine-Grained Authorization (FGA) Model:
   - Defines relationship tuples (`user -> has_role -> role` and `role -> can_view -> document`).
   - ReBAC evaluation checks user permissions against candidate vector chunks.
3. Pre-Retrieval Policy Enforcement:
   - Managers possess `can_view` for sensitive executive compensation documents (`doc:executive_salaries_2026`).
   - General employees are restricted to non-sensitive records (`doc:engineering_architecture_roadmap`, `doc:standard_leave_policy`).
   - Unauthorized documents are culled from the retrieval set prior to LLM synthesis, preventing prompt leakage.

## Setup & Running
1. Install dependencies:
   npm install
2. Configure .env with your Auth0 credentials:
   ISSUER_BASE_URL=https://dev-qws72xhqw0o5utub.us.auth0.com
   CLIENT_ID=ntW1vkdBP5B8vmiu5DH7Gi6jKuMQFB1S
   SECRET=your_32_char_secret
   BASE_URL=http://localhost:3000
   PORT=3000
3. Start the application:
   node server.js
4. Access http://localhost:3000 and test queries across Manager and Employee personas.
