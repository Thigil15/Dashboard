# Escala Atual Tab - Implementation Documentation

## Overview

This document describes the implementation of the new "Escala Atual" tab in the Escala view, which displays reference schedules from Firebase `EscalaAtualUTI`, `EscalaAtualCardiopediatria`, and `EscalaAtualEnfermaria` data sources.

## Problem Statement (Portuguese)

> "Em Escala, você vai achar no repositório o arquivo Excel de como é pra ficar a escala, e dentro do firebase voce vai achar "EscalaAtualUTI", "EscalaAtualCardiopediatria", "EscalaAtualEnfermaria". analise os dois e faça uma aba com a Escala Atual. para conseguirmos visualizar a escala pela dashboard."

**Translation:** "In Escala, you will find in the repository the Excel file showing how the schedule should look, and within Firebase you will find 'EscalaAtualUTI', 'EscalaAtualCardiopediatria', 'EscalaAtualEnfermaria'. Analyze both and create a tab with the Current Schedule so we can view the schedule from the dashboard."

## Solution Design

### Tab Structure

The Escala view now has two tabs:

1. **Escala Mensal** (Monthly Schedule)
   - Shows aggregated data from `Escala1`, `Escala2`, `Escala3`, etc.
   - Displays actual student assignments to dates
   - Previous implementation maintained

2. **Escala Atual** (Current Schedule) - **NEW**
   - Shows reference schedules from `EscalaAtualUTI`, `EscalaAtualCardiopediatria`, `EscalaAtualEnfermaria`
   - Displays shift codes (M, T, N, MT, FC, F, AULA, AB, etc.) for each student by date
   - Aggregates all three sectors into one unified view

## Data Sources

### Firebase Paths

```
exportAll/
  ├── EscalaAtualUTI/
  │   └── dados/ → Array of student records
  ├── EscalaAtualCardiopediatria/
  │   └── dados/ → Array of student records
  └── EscalaAtualEnfermaria/
      └── dados/ → Array of student records
```

### Student Record Format

Each student record contains:
- `Aluno` / `NomeCompleto` / `Nome` - Student name
- `Supervisor` - Supervisor name
- `Horario` / `Horário` - Work schedule
- `Unidade` - Sector (automatically derived from data source)
- `Curso` - Course type (for color-coding)
- Date fields in formats: `DD/MM`, `D_MM`, `DD_M`, `D_M`
- Shift values: M, T, N, MT, FC, F, AULA, AB, - (empty)

## Implementation Details

### HTML Changes (`index.html`)

Added tab navigation:
```html
<div class="escala-tabs-nav">
    <button class="escala-tab-btn active" data-escala-tab="mensal">...</button>
    <button class="escala-tab-btn" data-escala-tab="atual">...</button>
</div>
```

Separated content containers:
- `#escala-mensal-container` - For monthly schedule
- `#escala-atual-container` - For current schedule

Each container has:
- `#escala-{type}-loading` - Loading state
- `#escala-{type}-empty` - Empty state
- `#escala-{type}-content` - Table content

### CSS Changes (`style.css`)

Added new styles starting at line ~15695:

```css
/* Tab Navigation */
.escala-tabs-nav { ... }
.escala-tab-btn { ... }
.escala-tab-btn.active { ... }
.escala-tab-content { ... }
.escala-tab-content.active { ... }
```

Key features:
- Active tab has blue bottom border
- Smooth transitions on hover
- Icon + text layout
- Responsive design

### JavaScript Changes (`script.js`)

#### New Function: `renderEscalaAtualTable()` (Line ~3125)

**Purpose:** Renders the reference schedule from EscalaAtual data

**Algorithm:**
1. Collect data from all three EscalaAtual sources (UTI, Cardiopediatria, Enfermaria)
2. Aggregate all students and dates
3. Sort dates chronologically
4. Group students by sector
5. Generate period label (e.g., "Dezembro 2025 (01/12 a 28/12)")
6. Build Excel-style table with:
   - Day number row
   - Day of week abbreviation row
   - Sector header rows
   - Student rows with shift codes

**Features:**
- Multiple date format support (DD/MM, D_MM, DD_M, D_M)
- Weekend highlighting (green background)
- Today's date highlighting (blue border)
- Student type color-coding (Bolsista/Pagante/Residente)
- Shift code badges with appropriate colors

#### Updated Function: `initializeEscalaAtualPanel()` (Line ~2583)

**Changes:**
- Added tab switching event listeners
- Updates both tab headers with current date
- Renders appropriate table when tab becomes active
- Default tab is "Escala Mensal"

**Tab Switching Logic:**
```javascript
btn.addEventListener('click', () => {
    // Update active states
    // Show/hide content
    // Render appropriate table
});
```

#### Updated Function: `triggerUIUpdates()` (Line ~815)

**Changes:**
- `escalas` updates: Only re-render if on "mensal" tab
- `escalaAtual*` updates: Re-render if on "atual" tab

## Shift Code Mapping

| Code | Meaning | CSS Class | Color |
|------|---------|-----------|-------|
| M | Manhã (Morning 07-13h) | `shift-m` | Cyan/Green |
| T | Tarde (Afternoon 13-19h) | `shift-t` | Cyan/Green |
| N | Noite (Night 19-07h) | `shift-n` | Blue/Purple |
| MT | Dia Completo (Full day) | `shift-mt` | Blue |
| FC | Folga Compensatória | `shift-fc` | Purple |
| F | Folga Pedida | `shift-f` | Gray |
| AULA | Aula/HCx | `shift-aula` | Pink |
| AB | Ambulatório | `shift-ab` | Cyan |
| - | No activity | `shift-empty` | Light gray |

## Student Type Color-Coding

| Type | CSS Class | Visual |
|------|-----------|--------|
| Bolsista (Scholarship) | `tipo-bolsista` | Blue dot |
| Pagante (Paying) | `tipo-pagante` | Red dot |
| Residente (Resident) | `tipo-residente` | Green dot |

## User Experience Flow

1. User navigates to "Escala" tab from main navigation
2. Default view shows "Escala Mensal" tab (monthly schedule)
3. User clicks "Escala Atual" tab button
4. Tab switches, showing reference schedule
5. Table displays:
   - All students from all three sectors (UTI, Cardiopediatria, Enfermaria)
   - Grouped by sector with clear headers
   - Daily shift assignments
   - Weekend days highlighted in green
   - Today's date highlighted with blue border

## Testing Checklist

- [x] JavaScript syntax validation passes
- [x] HTML elements created correctly
- [x] CSS classes defined
- [ ] Login to application
- [ ] Navigate to "Escala" tab
- [ ] Verify "Escala Mensal" tab shows by default
- [ ] Click "Escala Atual" tab
- [ ] Verify table loads with data from Firebase
- [ ] Check students grouped by sector (UTI, Cardiopediatria, Enfermaria)
- [ ] Verify date range in header
- [ ] Confirm weekends have green background
- [ ] Confirm today's date has blue border/background
- [ ] Check shift codes display correctly
- [ ] Verify student names are color-coded
- [ ] Test tab switching back to "Escala Mensal"
- [ ] Verify legend shows all shift types

## Troubleshooting

### Tab Not Switching

**Possible causes:**
1. Event listeners not attached
2. JavaScript error preventing execution

**Solution:**
1. Open browser console (F12)
2. Check for errors
3. Verify `initializeEscalaAtualPanel()` was called
4. Check network tab for Firebase data loading

### Escala Atual Shows "No Data"

**Possible causes:**
1. Firebase data not loaded
2. Data structure mismatch
3. Firebase permissions issue

**Solution:**
1. Check Firebase Console: `exportAll/EscalaAtualUTI/dados`
2. Verify data structure matches expected format
3. Check browser console for errors
4. Verify Firebase permissions allow read access

### Dates Not Displaying

**Possible causes:**
1. Date fields missing in student records
2. Date format mismatch

**Solution:**
1. Check student record has date fields (DD/MM or D_MM format)
2. Verify `headersDay` array is populated
3. Check console logs for date parsing

### Shift Codes Not Showing

**Possible causes:**
1. Date format doesn't match any supported variants
2. Shift value is null/undefined
3. CSS class missing

**Solution:**
1. Check supported date formats: DD/MM, D_MM, DD_M, D_M
2. Verify shift values exist in Firebase data
3. Check CSS for `.shift-{code}` classes

## Future Enhancements

1. **Period Selector** - Switch between different months/periods
2. **Export** - Download as Excel or PDF
3. **Search/Filter** - Find specific students or sectors
4. **Supervisor View** - Filter by supervisor
5. **Print View** - Printer-friendly format
6. **Mobile Optimization** - Better touch controls
7. **Real-time Updates** - Auto-refresh when Firebase data changes

## File Changes Summary

### Modified Files

1. **index.html**
   - Lines ~575-700: Added tab navigation and separate containers
   - Total: ~125 lines modified

2. **style.css**
   - Lines ~15691-15750: Added tab navigation styles
   - Total: ~60 lines added

3. **script.js**
   - Line ~2583: Updated `initializeEscalaAtualPanel()`
   - Line ~815: Updated `triggerUIUpdates()`
   - Line ~2848: Updated `renderMonthlyEscalaTable()` element IDs
   - Line ~3125: Added new `renderEscalaAtualTable()` function
   - Total: ~350 lines modified/added

### Total Changes
- **Files modified:** 3
- **Lines added:** ~415
- **Lines modified:** ~125
- **Functions added:** 1 (`renderEscalaAtualTable`)
- **Functions updated:** 3 (`initializeEscalaAtualPanel`, `triggerUIUpdates`, `renderMonthlyEscalaTable`)

## References

- Reference Excel file: `10. Dezembro - 2025 (01.12 à 28.12.2025).xlsx`
- Firebase config: `firebase-config.js`
- Styles: `style.css` (lines 15691-16324)
- Main logic: `script.js` (lines 2583-3360)
- Previous rebuild documentation: `ESCALA_REBUILD.md`

## Support

For questions or issues:
1. Check browser console for errors (F12)
2. Review Firebase data structure
3. Consult this documentation
4. Check `ESCALA_REBUILD.md` for monthly view details

---

**Created:** 2025-12-10
**Author:** GitHub Copilot
**Version:** 1.0.0
**Feature:** Escala Atual Tab
**Status:** ✅ Implemented
