# Escala (Schedule) System - Complete Rebuild Documentation

## Overview

This document describes the complete rebuild of the Escala (Schedule) system to pull data directly from Firebase Escala sheets and display it in a professional, minimalist table format matching the Excel reference file.

## Problem Statement (Portuguese)

> "Ficou péssima essa escala atual, refaça do zero. preciso de uma escala de verdade, puxe os dados do firebase analise, e veja como construir. Precisa ser uma Escala para os alunos conforme os dados do firebase. Se puder fazer em formato de tabela porém minimalista e ao mesmo tempo profissional com os detalhes certos, eu agradeço."

**Translation:** "The current schedule is terrible, rebuild it from scratch. I need a real schedule, pull the data from Firebase, analyze it, and see how to build it. It needs to be a Schedule for students based on Firebase data. If you can make it in a table format, minimalist yet professional with the right details, I'd appreciate it."

## What Changed

### Before (Old Implementation)
- Used `EscalaAtualEnfermaria`, `EscalaAtualUTI`, `EscalaAtualCardiopediatria` from Firebase
- Had sector tab selector to switch between 3 sectors
- Limited view showing only one sector at a time
- Reference-only data (M, T, N codes without student assignments)

### After (New Implementation)
- Uses `Escala1`, `Escala2`, `Escala3`, etc. from Firebase
- No sector tabs - shows all students in one unified view
- Students automatically grouped by sector (Unidade field)
- Real schedule data with actual student assignments to dates
- Matches Excel file format ("10. Dezembro - 2025.xlsx")

## Data Source

### Firebase Structure
```
exportAll/
  ├── Escala1/
  │   └── dados/
  │       └── [array of student records]
  ├── Escala2/
  │   └── dados/
  │       └── [array of student records]
  └── ...
```

### Student Record Format
Each student record contains:
- `NomeCompleto` / `Aluno` / `Nome` - Student name
- `Unidade` / `Setor` - Sector (Enfermaria, UTI, Cardiopediatria)
- `Supervisor` - Supervisor name (optional)
- `Curso` - Course type (for color-coding)
- Date fields in two formats:
  - `DD/MM` (e.g., "01/12", "25/12")
  - `D_MM` (e.g., "1_12", "25_12") 
- Shift values: M, T, N, MT, FC, F, AULA, AB, - (empty)

## Implementation Details

### Data Aggregation Algorithm

```javascript
1. Find all Escala sheets (Escala1, Escala2, etc.) in Firebase
2. Extract all students from all sheets
3. Collect all unique dates from all sheets
4. Sort dates chronologically
5. Group students by sector (Unidade field)
6. Sort sectors (Enfermaria, UTI, Cardiopediatria first)
7. Render table with:
   - Header with period information
   - Day number row
   - Day of week row (D, S, T, Q, Q, S, S)
   - Sector headers
   - Student rows with daily assignments
```

### Date Handling

The system supports multiple date format variations:
- `DD/MM` - Pretty format (01/12)
- `D_MM` - Underscore format (1_12)
- `DD_M` - Single digit month (01_1)
- `D_M` - Both single digits (1_1)

When rendering, it tries all variations to find the shift value.

### Shift Code Mapping

| Code | Meaning | Color |
|------|---------|-------|
| M | Manhã (Morning 07-13h) | Cyan/Green |
| T | Tarde (Afternoon 13-19h) | Cyan/Green |
| N | Noite (Night 19-07h) | Blue/Purple |
| MT | Dia Completo (Full day) | Blue |
| FC | Folga Compensatória | Purple |
| F | Folga Pedida | Gray |
| AULA | Aula/HCx | Pink |
| AB | Ambulatório | Cyan |
| - | No activity | Light gray |

### Student Type Color-Coding

| Type | Color | Logic |
|------|-------|-------|
| Bolsista (Scholarship) | Blue | Contains "bolsista" or non-paying course |
| Pagante (Paying) | Red | Contains "pagante" or paying course |
| Residente (Resident) | Green | Contains "residente" or residency course |

### CSS Classes Used

**Table Structure:**
- `.escala-mensal-header` - Period header
- `.escala-mensal-table-wrapper` - Scrollable wrapper
- `.escala-mensal-table` - Main table
- `.escala-mensal-sector-row` - Sector divider

**Cells:**
- `.col-nome` - Name column (sticky)
- `.weekend` - Weekend column (green)
- `.holiday` - Holiday column (green)
- `.today-col` - Today's column (blue)

**Content:**
- `.escala-mensal-shift` - Shift badge
- `.escala-mensal-nome-aluno` - Student name
- `.escala-mensal-nome-supervisor` - Supervisor name
- `.tipo-bolsista` / `.tipo-pagante` / `.tipo-residente` - Type colors

## File Changes

### script.js

**Function: `renderEscalaAtualTable()`** (Line ~2881)
- **Before:** Rendered one sector from `escalaAtual[Sector]` data
- **After:** Aggregates all Escala sheets and renders unified view

**Function: `initializeEscalaAtualPanel()`** (Line ~2585)
- **Before:** Setup sector tabs, update counts
- **After:** Simplified - just renders the table

**Function: `triggerUIUpdates()`** (Line ~742)
- **Before:** Listened to `escalaAtual[Sector]` changes
- **After:** Listens to `escalas` changes

### index.html

**Section: Escala View** (Line ~575)
- **Before:** Had sector pill buttons (Enfermaria, UTI, Cardiopediatria tabs)
- **After:** Simplified toolbar with just date display

### style.css

No changes needed - already had comprehensive styles for:
- `.escala-mensal-*` classes for compact table
- Weekend/today highlighting
- Shift badges
- Responsive design

## Testing Checklist

- [ ] Login to application
- [ ] Navigate to "Escala" tab
- [ ] Verify table loads with data from Firebase
- [ ] Check students grouped by sector
- [ ] Verify date range in header (e.g., "Dezembro 2025 (01/12 a 28/12)")
- [ ] Confirm weekends have green background
- [ ] Confirm today's date has blue border/background
- [ ] Check shift codes display correctly
- [ ] Verify student names are color-coded
- [ ] Test horizontal scroll on mobile
- [ ] Verify legend shows all shift types

## Troubleshooting

### Table Shows "No Data"

**Possible causes:**
1. No Escala sheets in Firebase
2. Escala sheets have no `dados` array
3. Firebase permissions issue

**Solution:**
1. Check Firebase Console: `exportAll/Escala1/dados`
2. Verify data structure matches expected format
3. Check browser console for errors

### Dates Not Displaying

**Possible causes:**
1. Date fields missing in student records
2. Date format mismatch

**Solution:**
1. Check student record has date fields (DD/MM or D_MM format)
2. Verify `headersDay` array is populated in Escala sheet

### Students Not Grouped Properly

**Possible cause:**
- Missing or inconsistent `Unidade` field

**Solution:**
- Ensure each student has `Unidade` field set to sector name

## Future Enhancements

1. **Period Selector** - Switch between different months/periods
2. **Export** - Download as Excel or PDF
3. **Search/Filter** - Find specific students
4. **Statistics** - Shift count, coverage analysis
5. **Holiday Integration** - Auto-highlight holidays
6. **Print View** - Printer-friendly format
7. **Mobile Optimization** - Better touch controls

## References

- Reference Excel file: `10. Dezembro - 2025 (01.12 à 28.12.2025).xlsx`
- Firebase config: `firebase-config.js`
- Styles: `style.css` (lines 15261-16324 for escala-mensal styles)
- Main logic: `script.js` (lines 2570-3074)

## Support

For questions or issues, please contact the development team or create an issue in the repository.

---

**Last Updated:** 2025-12-10
**Author:** GitHub Copilot
**Version:** 2.0.0 (Complete Rebuild)
