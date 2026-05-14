# Duplicate Email Feature – Update Changes

This document describes the changes introduced to allow creating a second employee with the **same email** when a boolean flag is sent (payroll-only employee: no login, override attendance, generate payroll).

---

## Summary

- **One variable:** `allowDuplicateEmail` (boolean) in create user request body.
- **Rule:** If **duplicate email** is found **and** `allowDuplicateEmail: true` → **allow insert** (new employee is created with `portalAccess: false` – payroll-only, no login).
- **Otherwise:** Duplicate email is rejected (same as before); normal create/update/login behaviour is unchanged.

---

## 1. User Model (`src/models/user.model.ts`)

| Change | Description |
|--------|-------------|
| **Email field** | Removed `unique: true` from schema. Email is no longer globally unique at schema level. |
| **Index** | Replaced global unique index on `email` with a **partial unique index**: email unique only when `portalAccess: true`. Same email is allowed for users with `portalAccess: false`. |

```ts
// Before: userSchema.index({ email: 1 }, { unique: true });
// After:
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { portalAccess: true } }
);
```

---

## 2. User Create (`src/services/user.service.ts`)

| Change | Description |
|--------|-------------|
| **New field** | `allowDuplicateEmail?: boolean` added to create payload (not stored in DB). |
| **Two-condition logic** | If duplicate email **and** `allowDuplicateEmail === true` → allow create and set `portalAccess: false`. Otherwise reject duplicate with message to send `allowDuplicateEmail: true`. |
| **No duplicate path** | When email is new, behaviour unchanged: create as normal (portalAccess from body or default true). |
| **E11000 handling** | On duplicate key error when `allowDuplicateEmail` was true, return clear message to run DB migration (if old index still exists). |
| **Welcome email** | Sent only when `savedUser.active && savedUser.portalAccess`. Payroll-only (portalAccess false) users do not receive welcome email. |

---

## 3. User Update (`src/services/user.service.ts`)

| Change | Description |
|--------|-------------|
| **Email uniqueness** | Uniqueness enforced only among users with `portalAccess: { $ne: false }` (portal = can log in; existing users without the field are treated as portal). Updating to an email already used by a `portalAccess: false` user is allowed. |
| **Normal users** | Updating to an email already used by another portal user is still rejected. |

---

## 4. Auth (`src/services/auth.service.ts`)

| Change | Description |
|--------|-------------|
| **Login** | Query uses `email`, `active: true`, and `portalAccess: { $ne: false }`. Only the portal user can log in when multiple users share the same email. Reject only when `portalAccess === false` (existing users without the field are treated as portal). |
| **Forgot password** | Query uses `email` and `portalAccess: { $ne: false }`. Reset is sent only to the portal user. Existing users without `portalAccess` can reset. |
| **Reset password** | By token only; always updates the user who requested reset (original/portal user). |

---

## 5. Routes (`src/routes/user.routes.ts`)

| Change | Description |
|--------|-------------|
| **Create body** | Optional `allowDuplicateEmail` (boolean) added to POST `/users` body schema. Description explains: if true and email already exists, create payroll-only employee (same email, no login). |

---

## 5a. How to Add `allowDuplicateEmail` in API Request (Frontend / Postman)

When the email already exists and you want to create a **second employee** with the same email (payroll-only, no login), add **`allowDuplicateEmail: true`** to the request body.

### Request

| Field | Value |
|-------|--------|
| **URL** | `POST /api/users` (e.g. `http://localhost:5173/api/users` or your API base URL) |
| **Method** | POST |
| **Content-Type** | application/json |

### Request body example (duplicate email allowed)

```json
{
  "name": "Chris",
  "email": "chris@gmail.com",
  "employeeCode": "CJ0002",
  "allowDuplicateEmail": true,
  "role": "staff",
  "departmentId": "production",
  "costCenter": "chennaioffice",
  "country": "IN",
  "currency": "INR",
  "employmentStatus": "confirmed",
  "joiningDate": "2026-01-23T06:30:00.000Z",
  "dateOfBirth": "2000-01-14T06:30:00.000Z",
  "probationDate": "180",
  "noticePeriod": 60,
  "password": "123456",
  "managerId": "69735bcc77ea11ab2d790594"
}
```

**Important:** Include **`"allowDuplicateEmail": true`** when the email (e.g. `chris@gmail.com`) already exists and you want to create a payroll-only employee with the same email.

### Frontend (JavaScript / Axios) example

```javascript
const payload = {
  name: "Chris",
  email: "chris@gmail.com",
  employeeCode: "CJ0002",
  role: "staff",
  departmentId: "production",
  costCenter: "chennaioffice",
  country: "IN",
  currency: "INR",
  employmentStatus: "confirmed",
  joiningDate: "2026-01-23T06:30:00.000Z",
  dateOfBirth: "2000-01-14T06:30:00.000Z",
  probationDate: "180",
  noticePeriod: 60,
  password: "123456",
  managerId: "69735bcc77ea11ab2d790594",
  allowDuplicateEmail: true   // add this for duplicate-email (payroll-only) employee
};

await axios.post('/api/users', payload);
```

### If you don't add `allowDuplicateEmail`

When the email already exists and you **do not** send `allowDuplicateEmail: true`, the API returns **400 Bad Request**:

```json
{
  "success": false,
  "error": {
    "message": "Email \"chris@gmail.com\" already exists. Send allowDuplicateEmail: true to create payroll-only employee with same email (no login, override attendance, generate payroll)."
  }
}
```

### Summary

| Goal | Action |
|------|--------|
| Create **first** employee with this email | Do **not** send `allowDuplicateEmail`, or use a different email. |
| Create **second** employee with **same** email (payroll-only) | Add **`allowDuplicateEmail: true`** to the request body. |

---

## 6. Data Migration / Bulk Upload (`src/services/data-migration.service.ts`)

| Change | Description |
|--------|-------------|
| **DB duplicate check** | Uses `existingEmailsPortalOnly` (emails of users with `portalAccess !== false`). Duplicate email is rejected only when row has Portal Access = Yes and email exists for a portal user. |
| **Portal Access = No** | Rows with Portal Access = No can have the same email as an existing portal user (Emp-1 + Emp-2 scenario). |
| **Within-file duplicate** | Same email in multiple rows is allowed only if at most one row has Portal Access = Yes (or not explicitly No). If more than one row with same email has Portal Access = Yes, validation error is returned. |
| **Removed** | Unused variable `existingEmails` removed (fixes TS6133). |

---

## 7. Optional: DB Migration Script

| Item | Description |
|------|-------------|
| **Script** | `scripts/migrations/allow-duplicate-email-portal-access.ts` |
| **npm script** | `npm run db:allow-duplicate-email` |
| **Purpose** | Drops old global unique index `email_1` on `users` so the new partial index can work. Run **once** per environment if the old index exists. |
| **Note** | If the app was deployed with the old schema, run this once; then restart the app so the partial index is created. |

---

## 8. Behaviour Summary

| Scenario | Result |
|----------|--------|
| Create with **new email** (no duplicate) | Normal create; existing logic unchanged. |
| Create with **duplicate email**, **no** `allowDuplicateEmail` | Reject; message asks to send `allowDuplicateEmail: true` for payroll-only. |
| Create with **duplicate email** and **`allowDuplicateEmail: true`** | Allow create; new user has `portalAccess: false` (payroll-only, no login). |
| Login with shared email | Only the user with `portalAccess: true` can log in. |
| List users / Payroll / Override attendance | Both employees (same email) appear; payroll and override work by `userId`. |
| employeeCode, checkinId, biometricId | Still unique; no change. |

---

## 9. Existing Users Without `portalAccess` (Backward Compatibility)

- **Definition:** "Portal" = can log in = `portalAccess !== false` (true or missing/undefined).
- **Login / Forgot / Reset:** Queries use `portalAccess: { $ne: false }`; reject only when `portalAccess === false`. So existing users who have no `portalAccess` field in DB can still log in and reset password.
- **JWT / Middleware:** JWT stores `portalAccess: user.portalAccess !== false`; middleware rejects only when `decoded.portalAccess === false`. No change for existing portal users.
- **Create / Update email uniqueness:** "Portal" = `portalAccess: { $ne: false }`; only one portal user per email. Bulk upload: `existingEmailsPortalOnly` = emails of users with `portalAccess !== false`.

---

## 10. Existing Logic Not Affected

- Create with unique email.
- Create with duplicate email without the flag (still rejected).
- Login, forgot password, welcome email for normal (portal) users and for existing users without `portalAccess`.
- User update email uniqueness for portal users.
- Bulk upload: Portal Access = Yes and unique email; duplicate email for portal user still rejected.
- Leave, attendance override, payroll, payslip: all keyed by `userId`; no change.
- All other validations and business rules remain as before.

---

## 11. Full Scenario Analysis (All Flows – No Regression)

### A. Auth (login / forgot / reset)

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Login by email (unique user) | `findOne({ email, active: true, portalAccess: { $ne: false } })` → one user | No |
| Login by email (duplicate: portal + payroll-only) | Same query → only portal user matches | No (payroll-only never matches) |
| Login by existing user without `portalAccess` field | `$ne: false` matches; reject only `portalAccess === false` | No (backward compatible) |
| Forgot password (unique or portal duplicate) | `findOne({ email, portalAccess: { $ne: false } })` → portal user gets reset | No |
| Forgot password (duplicate user) | Payroll-only not in query → only portal user gets email | No |
| Reset password | By token only → always the user who requested (portal) | No |

### B. User create

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Create with new email | No duplicate; create as before (portalAccess from body or default true) | No |
| Create with duplicate email, no flag | Reject with message to send `allowDuplicateEmail: true` | No |
| Create with duplicate email + `allowDuplicateEmail: true` | Set `portalAccess: false`, create; no welcome email | New feature only |
| Create with new email, existing user already has same email with portalAccess undefined | Check `existingPortalUser` with `portalAccess: { $ne: false }` → reject if portal | No |

### C. User update

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Update email to new (unique) | Allowed | No |
| Update email to another portal user's email | `findOne({ email, portalAccess: { $ne: false }, _id: { $ne: id } })` → reject | No |
| Update email to payroll-only user's email | No other portal user has that email → allowed | No |
| Update other fields (no email change) | Unchanged | No |

### D. Middleware / JWT

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| JWT issued at login | `portalAccess: user.portalAccess !== false` (true for portal/missing) | No |
| Middleware JWT check | Reject only when `decoded.portalAccess === false` | No |
| WhatsApp auth user context | `portalAccess` = (user.portalAccess cast) !== false for backward compat | No |

### E. Leave / Attendance / Payroll / Payslip

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| All operations | Keyed by `userId` (JWT, params, or body); no email lookup for “which user” | No |
| Admin override for duplicate user | Pass duplicate user’s `userId` → works | No |
| Admin apply leave / payroll / payslip for duplicate user | Pass duplicate user’s `userId` → works | No |

### F. Check-in / Check-out (biometric swipe)

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Swipe by biometricId or userId | `getUserByBiometricId(biometricId)` → User.findById or findOne({ biometricId }) | No (no email) |

### G. Database

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Index migration on startup | Drop `email_1` if present; Mongoose creates partial unique index | No (index only; no data change) |
| Existing documents | Unchanged | No |

### H. Bulk upload (data-migration)

| Scenario | Implementation | Existing logic affected? |
|----------|----------------|---------------------------|
| Row with Portal Access = Yes, email exists for portal user | `existingEmailsPortalOnly` (portalAccess !== false) → reject | No |
| Row with Portal Access = No, same email as portal user | Allowed (payroll-only) | New feature only |
| Same email in file, multiple rows with Portal Access = Yes | Reject (at most one portal per email) | No |

---

## 12. Scenario Checklist (No Regression)

| Scenario | Expected | Status |
|----------|----------|--------|
| Existing user (no portalAccess field) logs in | Allowed | OK |
| Existing user (no portalAccess) forgot/reset password | Allowed | OK |
| New user, unique email | Normal create, login works | OK |
| New user, duplicate email, no flag | Rejected | OK |
| New user, duplicate email, allowDuplicateEmail: true | Created portalAccess: false, no login | OK |
| Duplicate (portalAccess false) tries login | Rejected | OK |
| Duplicate (portalAccess false) forgot password | Not found; portal user gets reset | OK |
| Admin override attendance for duplicate user | By userId; works | OK |
| Admin apply leave / payroll / payslip for duplicate user | By userId; works | OK |
| Update email to existing portal user's email | Rejected when current user has portal access | OK |
| List/search users by email | Both (portal + duplicate) returned; admin uses userId | OK |
| Check-in / check-out (swipe) | By biometricId/userId; no email | OK |
| Welcome email | Only when active && portalAccess (not sent to payroll-only) | OK |

---

*Last updated: Full implementation; all scenarios analyzed; existing logic not affected.*
