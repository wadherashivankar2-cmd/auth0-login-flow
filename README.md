# The Context-Preserving Assistant (Full-Stack Identity & API Access)

An identity-aware personal assistant web application built with Express and Auth0 Universal Login. It demonstrates authenticated session preservation across internal first-party settings and external third-party API orchestration.

## Architecture & Flow
1. User Authentication: Handled via Auth0 Universal Login (express-openid-connect), creating an authenticated OIDC session and verifying claims.
2. First-Party API (/api/user/preferences): Protected endpoint querying internal user records keyed to the authenticated user ID (sub).
3. Third-Party API Integration (Open-Meteo): Chains authenticated context by dynamically querying live weather telemetry using coordinates retrieved from the user's first-party profile.
4. Context-Preserving Assistant (/api/assistant/briefing): Fuses authenticated identity claims, internal preferences, and external public API data into a single coherent response payload.

## Setup & Running
1. Clone the repository and install dependencies:
   npm install
2. Configure .env based on .env.example with your Auth0 Domain and Client ID:
   ISSUER_BASE_URL=https://dev-qws72xhqw0o5utub.us.auth0.com
   CLIENT_ID=ntW1vkdBP5B8vmiu5DH7Gi6jKuMQFB1S
   SECRET=your_32_char_secret
   BASE_URL=http://localhost:3000
   PORT=3000
3. Start the application:
   node server.js
4. Navigate to http://localhost:3000, authenticate, and trigger the assistant dispatch.
