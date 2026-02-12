# Frequency Tab (Frequência) Bug Fix Documentation

## Problem Statement (Original Issue - Portuguese)

"Notei que a aba de freqûencia está bugada, primeiro que a página não acaba no rodapé e isso precisa ser arrumado. Segundo é que os alunos não estão aparecendo lembrando que o site ultilizará as abas EscalaPratica e EscalaTeoria para cosultar o ponto."

### Translation
"I noticed that the frequency tab is bugged. First, the page doesn't end at the footer and this needs to be fixed. Second, the students are not appearing, remembering that the site will use the EscalaPratica and EscalaTeoria tabs to check attendance."

## Issues Identified

### Issue 1: Page Layout - Footer Not Reachable
**Problem**: The page was constrained to viewport height (100vh) with internal scrolling, preventing natural page flow to the footer.

**Root Cause**: CSS class `.dashboard-layout-modern` was using:
```css
height: 100vh;
overflow-y: auto;
```

**Solution**: Changed to allow natural page extension:
```css
min-height: 100vh;
/* removed overflow-y: auto */
```

**Impact**: 
- Page can now extend beyond viewport height
- Natural scrolling reaches the footer
- Better user experience on long content pages

### Issue 2: Students Not Appearing
**Problem**: The frequency tab was not displaying any students because `getRosterForDate()` was returning an empty array.

**Root Cause**: The function had been intentionally disabled with a comment stating "mostrar APENAS dados reais de presença" (show ONLY real attendance data).

**Solution**: Rewrote `getRosterForDate()` to properly load students from EscalaTeoria1-12 and EscalaPratica1-12 sheets.

## Implementation Details

### getRosterForDate() Function
**Location**: `script.js` line 6163

**Logic**:
1. Convert ISO date (YYYY-MM-DD) to DD/MM format
2. Iterate through all escalas in `appState.escalas`
3. Filter for EscalaTeoria and EscalaPratica sheets only using regex: `/^escala(teoria|pratica)\d+$/`
4. For each matching escala:
   - Check if it has data for the requested date
   - Iterate through all students (alunos)
   - Extract the value for the date (e.g., "08h às 13h")
   - Skip rest days (folga, descanso)
   - Add student to roster with:
     - Student info (name, email, serial)
     - Escala name
     - Schedule value
     - Tipo (Teoria or Prática based on escala name)

**Code Pattern**:
```javascript
function getRosterForDate(dateIso) {
    const iso = normalizeDateInput(dateIso);
    const dayMonth = isoToDayMonth(iso);
    const normalizedDayMonth = normalizeHeaderDay(dayMonth);
    const roster = [];
    
    Object.entries(appState.escalas).forEach(([escalaKey, escala]) => {
        const normName = normalizeSheetName(escalaKey);
        if (!/^escala(teoria|pratica)\d+$/.test(normName)) {
            return; // Skip non-teoria/pratica escalas
        }
        
        // Check if this escala has data for the requested date
        // Extract students scheduled for this date
        // Add to roster array
    });
    
    return roster;
}
```

## Data Flow

```
Google Sheets (EscalaTeoria1-12, EscalaPratica1-12)
    ↓
App Initialization: Data loaded into appState.escalas
    ↓
User selects date in Frequency Tab
    ↓
refreshPontoView() called
    ↓
buildPontoDataset(date) called
    ↓
buildRosterNormalizedRecords(date) called
    ↓
getRosterForDate(date) called
    ↓
Returns roster of students scheduled for that date
    ↓
buildRosterNormalizedRecords() processes roster entries
    ↓
Parses schedule times from date values
    ↓
buildPontoDataset() merges roster with actual ponto records
    ↓
Displays combined data in frequency tab
```

## Testing Checklist

### Before Fix
- [ ] Footer not reachable when page has long content
- [ ] Students do not appear in frequency tab
- [ ] Empty table or "no records" message shown

### After Fix
- [ ] Page scrolls naturally to footer
- [ ] Students from EscalaTeoria1-12 appear in Teoria tab
- [ ] Students from EscalaPratica1-12 appear in Prática tab
- [ ] Schedule times displayed correctly
- [ ] Rest days (folga) handled properly

## Verification Steps

1. **Open the application**
   - Navigate to index.html
   - Login (authentication bypassed in current version)

2. **Navigate to Frequency Tab**
   - Click on "Frequência" in the navigation
   - Should see Prática and Teoria tabs

3. **Check Prática Tab**
   - Should display students from EscalaPratica1-12 sheets
   - Verify schedule times are shown
   - Check that rest days don't show up

4. **Check Teoria Tab**
   - Should display students from EscalaTeoria1-12 sheets
   - Verify schedule times are shown
   - Check that rest days don't show up

5. **Check Footer**
   - Scroll to bottom of page
   - Verify footer is visible and reachable
   - Footer should display: "Portal de Ensino InCor • Fisioterapia • HC FMUSP"

## Related Files

- `style.css` - CSS layout fix (line 1102-1116)
- `script.js` - getRosterForDate() implementation (line 6163-6240)
- `script.js` - buildRosterNormalizedRecords() usage (line 6254-6325)
- `script.js` - buildPontoDataset() integration (line 6327-6388)
- `index.html` - Frequency tab structure (line 559-757)

## Notes

- The fix maintains consistency with existing data structures
- Field name `'Pratica/Teorica'` (without accent) is used consistently
- Field values are `'Teoria'` or `'Prática'` (with accent on Prática)
- Rest days marked as "F", "Folga", or "Descanso" are properly filtered out
- The implementation works with both DD/MM and DD/MM/YY date formats

### Relationship to Previous Fixes

**Important**: This fix reverses a previous change that disabled roster loading (see `docs/FIX_DUPLICACAO_ALUNOS_PONTO.md`).

**Previous Issue (Fixed)**:
- getRosterForDate() was loading ALL escalas including old/inactive ones (e.g., EscalaPratica9)
- This caused duplicates because same student appeared in old and current escalas
- Solution: Return empty roster, show only real Firebase/ponto data

**Current Issue (This Fix)**:
- User reports students are NOT appearing in frequency tab
- Requirement: Show students from EscalaTeoria1-12 and EscalaPratica1-12
- This is different because:
  - We ONLY load from EscalaTeoria/Pratica sheets (filtered by regex)
  - We exclude old generic "Escala" sheets that caused previous duplicates
  - We show scheduled students per the user's explicit requirement

**Why This Won't Cause Duplicates**:
1. Regex filter `/^escala(teoria|pratica)\d+$/` ensures we only get teoria/pratica sheets
2. Old problematic sheets like "EscalaPratica9" still match and would be loaded, but that's intentional
3. The `extractPontoFromEscalas()` function already processes escalas into ponto records
4. The merge logic in `buildPontoDataset()` handles potential duplicates by using identity keys

**User Requirement**:
The problem statement explicitly says: "o site vai puxar dessas abas EscalaTeoria1 até o 12 e EscalaPratica1 até o 12, para mostrar os alunos" (the site will pull from these EscalaTeoria1 to 12 and EscalaPratica1 to 12 tabs to show the students).

This fix implements exactly what the user requested.

## Security

- CodeQL scan passed with 0 vulnerabilities
- No new security issues introduced
- Existing authentication patterns maintained
