// Firebase configuration for Portal do Ensino
// This configuration is loaded by index.html and used by script.js

const firebaseConfig = {
  apiKey: "AIzaSyCR3gZuiUUC-IMHduSGSuWWnFyn2sNYOEQ",
  authDomain: "dashboardalunos.firebaseapp.com",
  databaseURL: "https://dashboardalunos-default-rtdb.firebaseio.com",
  projectId: "dashboardalunos",
  storageBucket: "dashboardalunos.firebasestorage.app",
  messagingSenderId: "897767302445",
  appId: "1:897767302445:web:61dc5f0c3419ac680adfa4"
};

// Apps Script URL configuration
// This URL serves the JSON data directly from Google Sheets
// Replace with your deployed Apps Script web app URL
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
};

// Export configuration for ES6 module import
export default firebaseConfig;
export { firebaseConfig, appsScriptConfig };
