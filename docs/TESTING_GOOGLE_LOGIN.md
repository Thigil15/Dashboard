# Manual Testing Guide - Google Login Domain Restriction

## Overview
This guide provides step-by-step instructions for manually testing the Google login domain restriction feature implemented for the Portal do Ensino.

## Pre-requisites

### Firebase Console Configuration
Before testing, ensure the following are configured in the Firebase Console:

1. **Google Authentication Provider Enabled**
   - Navigate to: Firebase Console → Authentication → Sign-in method
   - Ensure "Google" provider is enabled
   - Support email should be configured

2. **Authorized Domains**
   - Navigate to: Firebase Console → Authentication → Settings → Authorized domains
   - Ensure your hosting domain is listed (e.g., `dashboardalunos.firebaseapp.com`)

3. **Test Accounts**
   - You'll need access to:
     - ✅ At least one Google account with @hc.fm.usp.br domain
     - ❌ At least one Google account with a different domain (@gmail.com, @usp.br, etc.)

## Test Scenarios

### Scenario 1: Valid Domain Login (Success Case) ✅

**Objective**: Verify that users with @hc.fm.usp.br accounts can login successfully.

**Steps**:
1. Open the application in a web browser
2. Ensure you are logged out (if not, click logout)
3. On the login screen, click the "Entrar com Google" button
4. In the Google popup, select an account with @hc.fm.usp.br domain
5. Authorize the application if prompted

**Expected Result**:
- ✅ Login successful
- ✅ Redirected to dashboard view
- ✅ User info displayed in header/menu
- ✅ Console shows: `[onAuthStateChanged] Domínio válido. Mostrando dashboard.`

**Actual Result**: _[To be filled during testing]_

---

### Scenario 2: Invalid Domain Rejection (Failure Case) ❌

**Objective**: Verify that users with non-@hc.fm.usp.br accounts are blocked.

**Steps**:
1. Open the application in a web browser
2. Ensure you are logged out
3. On the login screen, click the "Entrar com Google" button
4. In the Google popup, select an account with a different domain (e.g., @gmail.com)
5. Authorize the application if prompted

**Expected Result**:
- ❌ Login rejected
- ❌ Error message displayed: "Domínio não permitido. Use uma conta @hc.fm.usp.br."
- ❌ User remains on login screen
- ❌ Console shows: `[handleGoogleLogin] Domínio não permitido: gmail.com`

**Actual Result**: _[To be filled during testing]_

---

### Scenario 3: Popup Blocked by Browser 🚫

**Objective**: Verify friendly error handling when popup is blocked.

**Steps**:
1. Configure your browser to block popups for the site:
   - Chrome: Click padlock icon → Site settings → Popups and redirects → Block
   - Firefox: Preferences → Privacy & Security → Permissions → Block pop-up windows
2. On the login screen, click the "Entrar com Google" button

**Expected Result**:
- ⚠️ Error message displayed: "Popup bloqueado. Permita popups e tente novamente."
- ⚠️ User remains on login screen
- ⚠️ Console shows: `[handleGoogleLogin] Erro no login com Google:` with error code `auth/popup-blocked`

**Actual Result**: _[To be filled during testing]_

---

### Scenario 4: User Cancels Login 🔙

**Objective**: Verify friendly error handling when user closes popup.

**Steps**:
1. On the login screen, click the "Entrar com Google" button
2. When the Google popup appears, close it immediately (X button or Esc key)

**Expected Result**:
- 🔙 Error message displayed: "Login cancelado. Tente novamente."
- 🔙 User remains on login screen
- 🔙 Console shows error code `auth/popup-closed-by-user`

**Actual Result**: _[To be filled during testing]_

---

### Scenario 5: Network Failure 📡

**Objective**: Verify error handling for network issues.

**Steps**:
1. Disable your internet connection (or use browser DevTools to simulate offline)
2. On the login screen, click the "Entrar com Google" button

**Expected Result**:
- 📡 Error message displayed: "Falha de rede. Verifique sua conexão."
- 📡 User remains on login screen
- 📡 Console shows error code `auth/network-request-failed`

**Actual Result**: _[To be filled during testing]_

---

### Scenario 6: Email/Password Login (Regression Test) 📧

**Objective**: Verify that existing email/password login still works.

**Steps**:
1. On the login screen, enter valid email and password
2. Click the "Entrar no Portal" button

**Expected Result**:
- ✅ Login successful (if credentials are valid)
- ✅ Redirected to dashboard view
- ✅ No domain validation applied to email/password login
- ✅ Existing behavior unchanged

**Actual Result**: _[To be filled during testing]_

---

### Scenario 7: Logout and Re-login 🔄

**Objective**: Verify that logout works and user can login again.

**Steps**:
1. After successful login (Scenario 1), click the user menu
2. Click "Sair" or logout button
3. Verify you're redirected to login screen
4. Repeat Scenario 1 (login with valid domain)

**Expected Result**:
- 🔄 Logout successful, redirected to login screen
- 🔄 Can login again successfully
- 🔄 State cleanup performed correctly

**Actual Result**: _[To be filled during testing]_

---

### Scenario 8: Domain Validation on Auth State Change 🔐

**Objective**: Verify domain validation in onAuthStateChanged guard.

**Steps**:
1. Login with a valid @hc.fm.usp.br account
2. Open browser DevTools console
3. Refresh the page

**Expected Result**:
- ✅ User remains logged in (valid domain)
- ✅ Dashboard loads correctly
- ✅ Console shows: `[onAuthStateChanged] Usuário autenticado:` and `Domínio válido. Mostrando dashboard.`

**Note**: To test rejection in onAuthStateChanged, you would need to manually modify user data in Firebase, which is not recommended for production testing.

**Actual Result**: _[To be filled during testing]_

---

### Scenario 9: Account Picker Hint (`hd` parameter) 💡

**Objective**: Verify that Google account picker shows @hc.fm.usp.br accounts first.

**Steps**:
1. Ensure you're logged into multiple Google accounts in your browser
   - At least one @hc.fm.usp.br account
   - At least one other domain account
2. On the login screen, click the "Entrar com Google" button
3. Observe the account picker

**Expected Result**:
- 💡 Google account picker prioritizes @hc.fm.usp.br accounts
- 💡 @hc.fm.usp.br accounts appear at the top of the list
- ⚠️ Note: This is a hint, not enforcement - users can still select other accounts

**Actual Result**: _[To be filled during testing]_

---

## Browser Compatibility Testing

Test the implementation in the following browsers:

| Browser | Version | Scenario 1 | Scenario 2 | Scenario 3 | Scenario 4 | Scenario 6 | Notes |
|---------|---------|------------|------------|------------|------------|------------|-------|
| Chrome  | Latest  | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Firefox | Latest  | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Safari  | Latest  | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |
| Edge    | Latest  | ⬜ | ⬜ | ⬜ | ⬜ | ⬜ | |

Legend: ✅ Passed | ❌ Failed | ⬜ Not tested

---

## Console Log Verification

During testing, monitor the browser console for these key logs:

### Successful Login (Valid Domain)
```
[handleGoogleLogin] Iniciando login com Google...
[handleGoogleLogin] Login com Google bem-sucedido: usuario@hc.fm.usp.br
[onAuthStateChanged] Usuário autenticado: usuario@hc.fm.usp.br
[onAuthStateChanged] Domínio válido. Mostrando dashboard.
```

### Rejected Login (Invalid Domain)
```
[handleGoogleLogin] Iniciando login com Google...
[handleGoogleLogin] Login com Google bem-sucedido: usuario@gmail.com
[handleGoogleLogin] Domínio não permitido: gmail.com
[handleGoogleLogin] Erro no login com Google: Error: Domínio não permitido. Use uma conta @hc.fm.usp.br.
```

### Popup Blocked
```
[handleGoogleLogin] Iniciando login com Google...
[handleGoogleLogin] Erro no login com Google: {code: 'auth/popup-blocked', ...}
```

---

## Issue Reporting Template

If you encounter any issues during testing, please report them using this template:

**Issue Title**: [Brief description]

**Test Scenario**: [Scenario number and name]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Browser & Version**:
[e.g., Chrome 120.0.6099.109]

**Console Logs**:
```
[Paste relevant console logs here]
```

**Screenshots**:
[Attach screenshots if applicable]

**Additional Context**:
[Any other relevant information]

---

## Post-Testing Checklist

After completing all tests, verify:

- [ ] All success scenarios work as expected
- [ ] All failure scenarios show appropriate error messages
- [ ] No console errors (except expected authentication errors)
- [ ] Email/password login remains functional
- [ ] Logout works correctly
- [ ] Multiple browsers tested (if applicable)
- [ ] Documentation matches actual behavior
- [ ] No regression in existing functionality

---

## Security Considerations

### Client-Side Validation Limitations

⚠️ **Important**: The domain validation is implemented on the **client side**. This means:

1. **Sufficient for trust-based scenarios**: Works well when users have no malicious intent
2. **Can be bypassed**: Technically savvy users could bypass client-side checks
3. **Does not protect data access**: Users who bypass validation could still access data if Firebase rules aren't properly configured

### Recommended Additional Security (Optional)

For production environments with sensitive data, consider:

1. **Firebase Security Rules**: Configure Realtime Database rules to check email domain
   ```json
   {
     "rules": {
       ".read": "auth != null && auth.token.email.endsWith('@hc.fm.usp.br')",
       ".write": "auth != null && auth.token.email.endsWith('@hc.fm.usp.br')"
     }
   }
   ```

2. **Blocking Functions** (requires Blaze plan): Implement server-side enforcement
   - See `docs/LOGIN_GOOGLE_DOMINIO.md` for implementation details

---

## Test Results Summary

**Test Date**: _[To be filled]_

**Tested By**: _[To be filled]_

**Overall Result**: ⬜ Pass / ⬜ Fail / ⬜ Partial

**Critical Issues Found**: _[List any blocking issues]_

**Non-Critical Issues Found**: _[List any minor issues]_

**Recommendations**: _[Any recommendations for improvements]_

---

## Sign-off

**Tester**: _________________ **Date**: _________

**Reviewer**: _________________ **Date**: _________

**Approved for Production**: ⬜ Yes / ⬜ No / ⬜ Conditional

**Conditions (if applicable)**: _[List any conditions]_
