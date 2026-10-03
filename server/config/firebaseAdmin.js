'use strict';

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Guard against duplicate initialisation (e.g. nodemon hot-reload)
if (!getApps().length) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'signal-scout-483d5',
  });
}

module.exports = { auth: getAuth() };
