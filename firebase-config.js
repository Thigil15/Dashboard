import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import appsScriptConfig from './apps-script-config.js';

const firebaseConfig = {
  apiKey: "AIzaSyCR3gZuiUUC-IMHduSGSuWWnFyn2sNYOEQ",
  authDomain: "dashboardalunos.firebaseapp.com",
  databaseURL: "https://dashboardalunos-default-rtdb.firebaseio.com",
  projectId: "dashboardalunos",
  storageBucket: "dashboardalunos.firebasestorage.app",
  messagingSenderId: "897767302445",
  appId: "1:897767302445:web:61dc5f0c3419ac680adfa4"
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
