import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import appsScriptConfig from './apps-script-config.js';

const firebaseConfig = {
  apiKey: "AIzaSyCIo8xgqdatUr9o7ZwBks0zv2spG5C7zwY",
  authDomain: "portalensinoincor.firebaseapp.com",
  projectId: "portalensinoincor",
  storageBucket: "portalensinoincor.firebasestorage.app",
  messagingSenderId: "532264210404",
  appId: "1:532264210404:web:cdca69f1c330fdcf0281f1",
  measurementId: "G-TPG4BKVTZM"
};

// Diagnostic: confirm config is loaded (only logs projectId/authDomain and presence of apiKey — never the key value)
console.log('[firebase-config] Módulo carregado — projectId:', firebaseConfig.projectId,
  '| authDomain:', firebaseConfig.authDomain,
  '| apiKey presente:', Boolean(firebaseConfig.apiKey));

export default {
  initializeApp,
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  firebaseConfig,
  appsScriptConfig
};
