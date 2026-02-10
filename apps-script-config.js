// Apps Script configuration for Portal do Ensino
// This configuration is loaded by index.html and used by script.js

// Apps Script URL configuration - Used for ALL data loading
// This URL serves the JSON data directly from Google Sheets
// 
// ⚠️ SECURITY WARNING: With authentication removed, this URL is publicly accessible
// and anyone with access to this page can view all data. Consider:
// 1. Implementing access controls at the Apps Script deployment level
// 2. Adding rate limiting to prevent abuse
// 3. Restricting deployment access to specific domains if possible
// 4. Monitoring access logs for suspicious activity
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec"
};

// Export configuration for ES6 module import
export default appsScriptConfig;
export { appsScriptConfig };
