# Auth0 Login Flow

A full-stack OpenID Connect authentication implementation built with Express and Auth0 Universal Login.

## Features
- Auth0 Universal Login integration via express-openid-connect
- OpenID Connect state verification and session cookie management
- Dynamic landing view displaying real-time authentication state
- Protected /profile endpoint guarded with requiresAuth()

## Setup & Running
1. Clone the repository and install dependencies:
   npm install
2. Configure .env based on .env.example with your credentials.
3. Start the application:
   node server.js
4. Navigate to http://localhost:3000 to run the authentication flow.
