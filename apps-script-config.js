// Apps Script configuration for Portal do Ensino
// This configuration is loaded by index.html and used by script.js

// Apps Script URL configuration - Used for ALL data loading
// This URL serves the JSON data directly from Google Sheets
// NOTE: This URL is public (client-side code) and accessible to anyone.
// Configure access controls in Apps Script deployment settings if needed.
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec"
};

// Export configuration for ES6 module import
export default appsScriptConfig;
export { appsScriptConfig };
