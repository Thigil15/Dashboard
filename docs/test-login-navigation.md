# Test Plan: Login Navigation Fix

## Objective
Verify that the login navigation issue is fixed and the application no longer gets stuck on a non-existent student page.

## Pre-requisites
- Firebase configured with valid credentials
- At least one student in the database
- Valid login credentials

## Test Cases

### Test 1: Initial Page Load (Not Authenticated)
**Steps:**
1. Open the application in a new browser (incognito mode)
2. Check which view is displayed

**Expected Result:**
- Login view should be visible
- Dashboard view should be hidden
- Student detail view should be hidden
- No loading overlay should be stuck

**Status:** ⏳ Pending Manual Test

---

### Test 2: Successful Login Flow
**Steps:**
1. Start from logged out state (Test 1)
2. Enter valid credentials
3. Click "Entrar" (Login)
4. Wait for authentication

**Expected Result:**
- Loading overlay should appear briefly
- After authentication, should show dashboard-view (NOT student-detail-view)
- Should show the "Dashboard Geral" tab (not "Alunos" tab)
- Should load student data in the background
- No errors in console

**Status:** ⏳ Pending Manual Test

---

### Test 3: Logout Flow
**Steps:**
1. Start from authenticated state (Test 2)
2. Click "Sair" (Logout) button in sidebar
3. Wait for logout to complete

**Expected Result:**
- Should return to login view
- Dashboard view should be hidden
- Student detail view should be hidden
- Loading overlay should not be stuck
- All student data should be cleared from memory

**Status:** ⏳ Pending Manual Test

---

### Test 4: Navigate to Student Detail (Data Loaded)
**Steps:**
1. Start from authenticated state with data loaded
2. Click on "Alunos" tab
3. Click on a student card

**Expected Result:**
- Should show student-detail-view
- Should display correct student information
- All tabs should work (Info, Escala, Faltas, Notas Teóricas, Notas Práticas)
- "Voltar para Alunos" button should work

**Status:** ⏳ Pending Manual Test

---

### Test 5: Navigate to Student Detail (Data Not Loaded)
**Steps:**
1. Start from authenticated state
2. Immediately try to open student detail (before data loads)
   - This can be simulated by calling `showStudentDetail('test@example.com')` in console

**Expected Result:**
- Should show error message: "Os dados ainda estão sendo carregados. Por favor, aguarde um momento e tente novamente."
- Should NOT show student-detail-view
- Should remain on current view (dashboard or alunos list)
- Console should show: "[showStudentDetail] Dados de alunos ainda não carregados. Aguarde..."

**Status:** ⏳ Pending Manual Test

---

### Test 6: Navigate to Non-Existent Student
**Steps:**
1. Start from authenticated state with data loaded
2. Try to open non-existent student detail
   - Call `showStudentDetail('nonexistent@example.com')` in console

**Expected Result:**
- Should show error message: "Aluno nonexistent@example.com não encontrado."
- Should automatically navigate to dashboard-view, alunos tab
- Should NOT remain stuck on empty student detail page
- Console should show: "[showStudentDetail] Aluno nonexistent@example.com não encontrado no mapeamento."

**Status:** ⏳ Pending Manual Test

---

## Additional Browser Console Checks

### On Page Load
```javascript
// Check that views are in correct state
document.getElementById('login-view').style.display // Should be 'flex'
document.getElementById('dashboard-view').style.display // Should be 'none'
document.getElementById('student-detail-view').style.display // Should be 'none'
```

### After Login
```javascript
// Check that views are in correct state
document.getElementById('login-view').style.display // Should be 'none'
document.getElementById('dashboard-view').style.display // Should be 'flex'
document.getElementById('student-detail-view').style.display // Should be 'none'

// Check that data is loading
appState.alunos.length // Should be > 0 after data loads
appState.alunosMap.size // Should be > 0 after data loads
```

### After Logout
```javascript
// Check that state is clean
appState.alunos.length // Should be 0
appState.alunosMap.size // Should be 0
document.getElementById('login-view').style.display // Should be 'flex'
```

## Success Criteria
All tests pass with ✅ status

## Notes
- The original issue was: "After the last change, the site doesn't enter the login, it's stuck on the page of a student that doesn't exist and is frozen."
- The fix addresses this by:
  1. Ensuring login-view is always shown initially
  2. Preventing navigation to student-detail-view after login (always goes to dashboard)
  3. Adding validation before showing student details
  4. Managing loading overlay state properly
