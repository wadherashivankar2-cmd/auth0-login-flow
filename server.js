require('dotenv').config();
const express = require('express');
const { auth, requiresAuth } = require('express-openid-connect');

const app = express();

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.SECRET,
  baseURL: process.env.BASE_URL,
  clientID: process.env.CLIENT_ID,
  issuerBaseURL: process.env.ISSUER_BASE_URL
};

app.use(auth(config));

app.get('/', (req, res) => {
  const loggedIn = req.oidc.isAuthenticated();
  res.send(`
    <div style="font-family: sans-serif; text-align: center; margin-top: 60px;">
      <h1>Auth0 Universal Login Flow</h1>
      <p style="font-size: 1.1rem;">Status: <strong>${loggedIn ? 'Authenticated ?' : 'Logged Out ?'}</strong></p>
      ${
        loggedIn
          ? `<p>Welcome, <b>${req.oidc.user.name || req.oidc.user.email}</b>!</p>
             <div style="margin-top: 20px;">
               <a href="/profile"><button style="padding: 10px 20px; font-size: 1rem; margin-right: 10px; cursor: pointer;">View Profile</button></a>
               <a href="/logout"><button style="padding: 10px 20px; font-size: 1rem; cursor: pointer;">Log Out</button></a>
             </div>`
          : `<div style="margin-top: 20px;">
               <a href="/login"><button style="padding: 12px 24px; font-size: 1.1rem; background-color: #635bff; color: white; border: none; border-radius: 6px; cursor: pointer;">Log In with Auth0</button></a>
             </div>`
      }
    </div>
  `);
});

app.get('/profile', requiresAuth(), (req, res) => {
  res.send(`
    <div style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
      <h2>Authenticated User Profile</h2>
      <pre style="background: #f4f4f4; padding: 15px; border-radius: 6px; overflow-x: auto;">${JSON.stringify(req.oidc.user, null, 2)}</pre>
      <div style="margin-top: 20px;">
        <a href="/"><button style="padding: 8px 16px; margin-right: 10px; cursor: pointer;">Home</button></a>
        <a href="/logout"><button style="padding: 8px 16px; cursor: pointer;">Log Out</button></a>
      </div>
    </div>
  `);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
