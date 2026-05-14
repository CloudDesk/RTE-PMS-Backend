# Latest Changes Summary

## 1. Payroll Module
### **Feature: Single Payroll Record Deletion**
- **Objective**: Allow administrators to delete a specific payroll record, but strictly restricted to records in `'Draft'` status.
- **Service Layer (`src/services/payroll.service.ts`)**:
  - Re-implemented `deletePayrollRecord(id: string)`.
  - Added validation:
    - Checks if `id` is a valid ObjectId.
    - Checks if the record exists.
    - **Critical Check**: Throws an error if `payroll.status !== 'Draft'`.
- **API Route (`src/routes/payroll.routes.ts`)**:
  - Added `DELETE /record/:id` endpoint.
  - Calls the service method and handles success/error responses.

## 2. Biometric Attendance Module
### **Feature: Bulk Attendance Insert Improvements**
- **Objective**: Replace hardcoded shift logic with dynamic shift assignments and allow control over random LOP generation.
- **Service Layer (`src/services/biometric-attendance.service.ts`)**:
  - **Dynamic Shifts**: The `insertBulkAttendanceRecords` method now fetches `ShiftAssignment` records for each user.
    - It respects the specific `startTime`, `endTime`, and `weekendDays` (e.g., `[0, 6]` for Sat/Sun) assigned to the user for that specific period.
    - No longer defaults to hardcoded 'NOON'/'MORN'/'GEN' shifts.
  - **Random LOP Control**: Added `skipRandomLop` parameter (default: `true`).
    - If `true` (default): All working days are marked as present (simulated swipes generated).
    - If `false`: One random working day is skipped (simulating an LOP/Absent day).
- **API Route (`src/routes/biometric-attendance.routes.ts`)**:
  - Updated `POST /bulk-insert` to accept `skipRandomLop` in the request body.
  - Example Payload:
    ```json
    {
      "userId": ["USER_ID_1", "USER_ID_2"],
      "month": 12,
      "year": 2025,
      "skipRandomLop": true
    }
    ```
