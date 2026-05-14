# Final Settlement – Frontend Implementation Guide

This document describes **all features** of the Final Settlement (FNF) module and how the frontend should integrate with the API. Use it for UI/UX, API contracts, and data structures.

---

## 1. Feature Summary (What Final Settlement Does)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Initialize FNF** | Auto-fill settlement data for a resigned employee from payroll (Hold + last paid), leave, resignation, and attendance. |
| 2 | **Hold salary display** | Show months that are on Hold in payroll; display net salary per month and total hold amount (read-only from backend). |
| 3 | **Unpaid months** | Show months between last paid and last working day (LWD) that are not Hold; display days worked, salary, PT, PF, ESI per month. |
| 4 | **Notice period** | Show notice period days, days served, shortfall/excess, and notice period recovery (deduction) amount. |
| 5 | **Leave encashment** | Show annual leave balance, encash days, per-day rate, and encashment amount (typically AL). |
| 6 | **Reimbursements** | Add/edit reimbursements (travel, medical, mobile, etc.) with description, amount, date; can be positive or negative. |
| 7 | **Other deductions / additions** | Add line items for other deductions (e.g. recovery) and other additions (e.g. bonus) with description and amount. |
| 8 | **Final calculation** | Display total payable (hold + unpaid + leave encashment + reimbursements + other additions), total deductions (notice recovery + PT + PF + ESI + other deductions), and **net amount**; show if net is negative (employee owes company). |
| 9 | **Save draft** | Save or update the settlement as Draft so user can edit later. |
| 10 | **Calculate (preview)** | Send current form data to get recalculated totals without saving (for instant preview). |
| 11 | **Confirm FNF** | Mark settlement as Confirmed; backend generates PDF and sends email; employee gets `finalSettlementDone` flag. |
| 12 | **Delete draft** | Delete only Draft settlement for an employee (Confirmed cannot be deleted). |
| 13 | **List settlements** | List all final settlements with pagination and optional filter by status (Draft / Confirmed). |
| 14 | **Get by employee** | Load latest settlement (Draft or Confirmed) for a given employee. |
| 15 | **Download FNF letter** | After confirm, show link to `pdfUrl` so user can download the FNF letter PDF. |

---

## 2. API Reference for Frontend

Base path: same as your API base URL (e.g. `/api` or ``). All endpoints require **authentication**.

### 2.1 List all final settlements

- **Method:** `GET`
- **Path:** `/final-settlement`
- **Query:**
  - `page` (number, default 1)
  - `limit` (number, default 10, max 100)
  - `status` (optional): `Draft` | `Confirmed`
- **Response (200):**
```json
{
  "success": true,
  "data": [ /* array of settlement documents */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```
- **Errors:** 500 on server error.

---

### 2.2 Initialize (auto-fill) for an employee

- **Method:** `GET`
- **Path:** `/final-settlement/initialize/:employeeId`
- **Params:** `employeeId` – MongoDB ObjectId string.
- **Response (200):**
```json
{
  "success": true,
  "message": "Final settlement data initialized",
  "data": { /* full settlement object – see Data Structure below */ }
}
```
- **Errors:**
  - 400 – Invalid employee ID.
  - 404 – Employee not found.
  - 500 – Server error.

---

### 2.3 Save draft

- **Method:** `POST`
- **Path:** `/final-settlement/save`
- **Body:** Settlement object (partial or full). **Required:** `employeeId` (string). All other fields optional; include any that user edited.
- **Response (200):**
```json
{
  "success": true,
  "message": "Final settlement saved as draft",
  "data": { /* saved settlement document */ }
}
```
- **Errors:**
  - 400 – Employee ID required or invalid.
  - 500 – Server error (e.g. validation on required fields if creating new draft with incomplete data).

---

### 2.4 Get settlement by employee

- **Method:** `GET`
- **Path:** `/final-settlement/:employeeId`
- **Params:** `employeeId` – MongoDB ObjectId string.
- **Response (200):**
```json
{
  "success": true,
  "data": { /* latest settlement document (Draft or Confirmed) */ }
}
```
- **Errors:**
  - 400 – Invalid employee ID.
  - 404 – No final settlement found for this employee.
  - 500 – Server error.

---

### 2.5 Confirm final settlement

- **Method:** `POST`
- **Path:** `/final-settlement/confirm/:employeeId`
- **Params:** `employeeId` – MongoDB ObjectId string.
- **Body:** Must include `confirmedBy` (string – admin/user ID). Can include full or partial settlement to merge last-minute edits.
  ```json
  { "confirmedBy": "<userId>", ...optional settlement fields... }
  ```
- **Response (200):**
```json
{
  "success": true,
  "message": "Final settlement confirmed successfully, PDF generated.",
  "data": { /* confirmed settlement with pdfUrl if generated */ }
}
```
- **Errors:**
  - 400 – Confirmed by ID required; or no draft found (“Initialize and save draft first”); or already confirmed.
  - 404 – Employee not found.
  - 500 – Server error.

---

### 2.6 Delete draft

- **Method:** `DELETE`
- **Path:** `/final-settlement/:employeeId`
- **Params:** `employeeId` – MongoDB ObjectId string.
- **Response (200):**
```json
{
  "success": true,
  "message": "Final settlement draft deleted successfully"
}
```
- **Errors:**
  - 400 – Invalid employee ID.
  - 404 – No draft found for this employee.
  - 500 – Server error.

---

### 2.7 Calculate (preview totals)

- **Method:** `POST`
- **Path:** `/final-settlement/calculate`
- **Body:** Same shape as settlement (partial OK): `holdPayrolls`, `unpaidMonths`, `leaveBalance`, `reimbursements`, `otherAdditions`, `otherDeductions`, `noticePeriodRecovery`, and optionally `finalCalculation.professionalTax`, `finalCalculation.providentFund`, `finalCalculation.esi` if not sending unpaidMonths.
- **Response (200):**
```json
{
  "success": true,
  "data": {
    "holdSalaries": 0,
    "unpaidSalaries": 0,
    "leaveEncashment": 0,
    "reimbursements": 0,
    "otherAdditions": 0,
    "gratuity": 0,
    "totalPayable": 0,
    "noticePeriodRecovery": 0,
    "professionalTax": 0,
    "providentFund": 0,
    "esi": 0,
    "otherDeductions": 0,
    "totalDeductions": 0,
    "netAmount": 0,
    "isNegative": false
  }
}
```
- **Errors:** 500 on server error.

---

## 3. Data Structure (Settlement Object)

Use this for forms, tables, and API payloads. All monetary values are numbers; dates are ISO strings or Date.

```ts
// Core
employeeId: string;           // ObjectId string
employeeName: string;
employeeCode: string;

// Resignation
resignationSubmittedOn: string; // ISO date
leavingDate: string;            // Last working day
leavingReason: string;
settlementDate: string;

// Notice
noticeRequired: boolean;
noticePeriodDays: number;
daysServed: number;
excessInNotice: number;        // positive = excess, negative = shortfall
noticePeriodRecovery: number;  // amount to deduct

// Work days summary
lastPaidMonth: string;         // e.g. "Sep 2025"
lastPaidMonthDate: string;
totalDaysWorked: number;

// Hold payrolls (read-only from API)
holdPayrolls: Array<{
  payrollId: string;
  month: number;
  year: number;
  monthYear: string;
  netSalary: number;
  monthlyGross: number;
  totalDays: number;
  daysWorked: number;
  presentDays: number;
  lopDays: number;
  status: string;
}>;
totalHoldAmount: number;

// Unpaid months (from initialize; can be edited if needed)
unpaidMonths: Array<{
  monthYear: string;
  month: number;
  year: number;
  totalDays: number;
  daysWorked: number;
  presentDays: number;
  weekendDays: number;
  holidayDays: number;
  leaveDays: number;
  lopDays: number;
  salary: number;
  professionalTax: number;
  providentFund: number;
  esi: number;
}>;
totalUnpaidSalary: number;

// Leave encashment
leaveBalance: Array<{
  leaveType: string;   // e.g. "AL"
  balance: number;
  encashDays: number;
  perDayRate: number;
  encashAmount: number;
}>;
totalLeaveEncashment: number;

// Reimbursements (user can add/edit)
reimbursements: Array<{
  type: 'travel' | 'medical' | 'mobile' | 'relocation' | 'certification' | 'other';
  description: string;
  amount: number;   // + or -
  date: string;
  receiptUrl?: string;
  completionDate?: string;
  monthsWorkedAfterCompletion?: number;
  requiredMonths?: number;
  isEligible?: boolean;
}>;
totalReimbursements: number;

otherDeductions: Array<{ description: string; amount: number }>;
totalOtherDeductions: number;
otherAdditions: Array<{ description: string; amount: number }>;
totalOtherAdditions: number;

// Final totals (display + from calculate API)
finalCalculation: {
  holdSalaries: number;
  unpaidSalaries: number;
  leaveEncashment: number;
  reimbursements: number;
  otherAdditions: number;
  gratuity: number;
  totalPayable: number;
  noticePeriodRecovery: number;
  professionalTax: number;
  providentFund: number;
  esi: number;
  otherDeductions: number;
  totalDeductions: number;
  netAmount: number;
  isNegative: boolean;
};

// Status
status: 'Draft' | 'Confirmed';
mode: 'automatic' | 'manual';
initiatedAt: string;
initiatedBy: string;
confirmedAt?: string;
confirmedBy?: string;
pdfUrl?: string;
createdAt: string;
updatedAt: string;
```

---

## 4. Recommended User Flows

### Flow A: Create and confirm a new FNF

1. User selects a resigned employee (e.g. from employee list filtered by resigned / on hold).
2. **Initialize:** `GET /final-settlement/initialize/:employeeId` → show form pre-filled with `data`.
3. User reviews and can edit: resignation dates, reimbursements, other deductions/additions. Hold and unpaid months are usually read-only; edits to unpaid months are possible only if you send them back in save.
4. **Optional – Preview:** On blur or “Recalculate”, call `POST /final-settlement/calculate` with current form data and show updated `data.finalCalculation`.
5. **Save draft:** `POST /final-settlement/save` with body = current form (at least `employeeId` + any changed fields).
6. **Confirm:** User clicks “Confirm settlement”; call `POST /final-settlement/confirm/:employeeId` with body `{ confirmedBy: "<currentUserId>" }` and optional last-minute fields. Show success and **Download FNF letter** link from `data.pdfUrl` if present.

### Flow B: Edit existing draft

1. From list or employee profile, open “Final settlement” for employee.
2. **Get:** `GET /final-settlement/:employeeId` → if `data.status === 'Draft'`, show form with `data`.
3. User edits and **Save draft** again; then **Confirm** when ready.

### Flow C: View confirmed FNF

1. **Get:** `GET /final-settlement/:employeeId` → if `data.status === 'Confirmed'`, show read-only summary and **Download FNF letter** (`data.pdfUrl`).
2. Do not show Edit / Delete.

### Flow D: List and filter

1. **List:** `GET /final-settlement?page=1&limit=10&status=Draft` (or `Confirmed` or no status).
2. Show table: employee name/code, status, last paid month, net amount, initiated/confirmed date; actions: View, Edit (if Draft), Delete (if Draft), Confirm (if Draft).

### Flow E: Delete draft

1. From draft view or list action: **Delete:** `DELETE /final-settlement/:employeeId`.
2. On 200, remove from list or redirect; on 404 show “No draft found”.

---

## 5. UI Sections to Implement

| Section | What to show | Editable |
|--------|----------------|----------|
| **Employee** | Name, code, employeeId (hidden) | No (from initialize/get) |
| **Resignation** | Resignation date, leaving date (LWD), reason, settlement date | Yes (dates, reason) |
| **Notice** | Notice period days, days served, excess/shortfall, notice recovery amount | Display; backend-calculated |
| **Last paid month** | Text e.g. “Sep 2025” | No |
| **Hold salary** | Table: month/year, net salary per row; total hold amount | No (from API) |
| **Unpaid months** | Table: month, days worked, salary, PT, PF, ESI per row; total unpaid salary | Prefer read-only; optional edit |
| **Leave encashment** | Leave type, balance, encash days, per-day rate, encash amount; total | Display; optional edit of encash days/amount if backend allows |
| **Reimbursements** | List with type, description, amount, date; add/remove rows; total | Yes |
| **Other deductions** | List: description, amount; add/remove; total | Yes |
| **Other additions** | List: description, amount; add/remove; total | Yes |
| **Final calculation** | Total payable, total deductions, **net amount**; highlight if `isNegative` | No (from API or calculate) |
| **Actions** | Save draft, Recalculate (preview), Confirm, Delete draft, Download FNF (when confirmed) | — |

---

## 6. Error Messages to Show (from API)

| HTTP | Condition | Show to user |
|------|-----------|---------------|
| 400 | Invalid employee ID | “Invalid employee.” |
| 400 | Employee ID required (save) | “Employee is required.” |
| 400 | Confirmed by ID required | “Please provide who is confirming.” |
| 400 | No draft to confirm | “No draft found. Please initialize and save a draft first, then confirm.” |
| 400 | Already confirmed | “This settlement is already confirmed.” |
| 404 | Employee not found | “Employee not found.” |
| 404 | No settlement for employee | “No final settlement found for this employee.” |
| 404 | No draft to delete | “No draft found to delete.” |
| 500 | Server error | “Something went wrong. Please try again.” (and log `details`) |

---

## 7. Features Checklist for Frontend

- [ ] **List screen:** Paginated list, filter by Draft/Confirmed, open by employee.
- [ ] **Initialize:** Call initialize API for selected employee and load form.
- [ ] **Form:** All sections above with correct fields and read-only vs editable.
- [ ] **Save draft:** Send at least `employeeId` + modified fields; show success.
- [ ] **Calculate (preview):** Optional recalculate button using calculate API and show updated finalCalculation.
- [ ] **Confirm:** Only when draft exists; send `confirmedBy`; show success and PDF link if `pdfUrl` present.
- [ ] **Delete draft:** Only for Draft; confirm before delete; call delete API.
- [ ] **Get by employee:** Load latest settlement for view/edit; show status (Draft/Confirmed).
- [ ] **Download FNF letter:** After confirm, show link/button using `pdfUrl`.
- [ ] **Validation:** Validate required fields (e.g. employeeId, dates) before save/confirm; show API validation errors.
- [ ] **Net amount:** Clearly show net pay; if `isNegative`, show that employee owes company.

---

## 8. Notes

- **Gratuity:** Backend currently returns `gratuity: 0`; no need to show gratuity input until backend enables it.
- **Payroll status:** After confirm, payroll remains **Hold**; no need to show or change payroll status from FNF screen.
- **One draft per employee:** Saving again updates the same draft; no “create another draft” from UI needed.
- **PDF:** If template is missing on server, confirm still succeeds but `pdfUrl` may be empty; show “PDF will be available later” or hide download until backend supports it.

This MD file lists **all features** and integration points for the Final Settlement frontend. Use it together with the API base URL and auth method used in your app.
