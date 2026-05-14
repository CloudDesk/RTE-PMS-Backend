# 💼 Real-World Final Settlement (FNF) Example

Here is a detailed, real-world scenario demonstrating how the **Zuno HR** system calculates a Final Settlement.

---

## 👤 Employee Profile: Amit Verma
*   **Designation**: Senior Developer
*   **Monthly Gross Salary**: ₹60,000
    *   **Basic (50%)**: ₹30,000
    *   **HRA (25%)**: ₹15,000
    *   **Special Allowance (25%)**: ₹15,000
*   **Notice Period**: 30 Days
*   **Leave Balance**: 5 Days (Annual Leave)
*   **Last Paid Month**: January 2024 (Payroll Processed & Paid)

---

## 📅 The Scenario: "Early Exit" (Notice Shortfall)

Amit decides to resign but wants to leave early to join a new company. He creates a shortfall in his notice period, which leads to a recovery deduction.

1.  **Resignation Submitted**: 1st Feb 2024.
2.  **Required Last Day (30 Days)**: 2nd Mar 2024.
3.  **Actual Last Working Day (LWD)**: 15th Feb 2024.
4.  **Days Served**: 15 Days.
5.  **Notice Shortfall**: 15 Days (30 Required - 15 Served).

---

## 🧮 System Calculations (Step-by-Step)

When the HR Admin initializes the settlement for Amit:

### 1. Unpaid Salary Calculation (Feb 1 - Feb 15)
The system detects that January is paid. It needs to pay for the 15 days worked in February 2024 (Leap Year = 29 Days).

*   **Formula**: `(Monthly Gross / Days in Month) * Days Worked`
*   **Calculation**: `(60,000 / 29) * 15`
*   **Result**: **₹31,034**

### 2. Leave Encashment
Calculated on **Basic Salary** (since DA is 0).

*   **Balance**: 5 Days
*   **Per Day Rate**: `Basic / 30` -> `30,000 / 30` = ₹1,000
*   **Calculation**: `5 * 1,000`
*   **Result**: **₹5,000**

### 3. Notice Period Recovery (Deduction)
Amit left 15 days early. The company policy recovers notice pay based on **Gross Salary**.

*   **Shortfall**: 15 Days
*   **Per Day Rate**: `Gross / 30` -> `60,000 / 30` = ₹2,000
*   **Calculation**: `15 * 2,000`
*   **Result**: **₹30,000** (Deduction)

### 4. Statutory Deductions (For 15 Days)
*   **Professional Tax (PT)**: ₹200 (Standard slab for Feb)
*   **Provident Fund (PF)**: 12% of Earned Basic.
    *   Earned Basic: `(30,000 / 29) * 15` = ₹15,517
    *   PF Calculation: `12% of 15,517`
    *   **Result**: **₹1,862**
*   *Note: ESI & Gratuity are disabled as per current configuration.*

---

## 💰 Final Settlement Slip

The system generates the following breakdown:

| **Component** | **Earnings (₹)** | **Deductions (₹)** |
| :--- | :--- | :--- |
| **Unpaid Salary (Feb)** | 31,034 | |
| **Leave Encashment** | 5,000 | |
| **Notice Recovery** | | 30,000 |
| **Provident Fund (PF)** | | 1,862 |
| **Professional Tax (PT)** | | 200 |
| **Income Tax** | | 0 |
| **TOTAL** | **36,034** | **32,062** |

### **NET PAYABLE: ₹3,972**

*(Calculation: 36,034 - 32,062)*

---

## 🔄 What Happens Automatically?

1.  **If LWD Changes**: If HR updates LWD to **Feb 20th**:
    *   The system immediately **Recalculates** everything.
    *   Unpaid Salary increases (20 days).
    *   Notice Recovery decreases (only 10 days shortfall).
    *   Net Pay increases significantly.

2.  **PDF Generation**:
    *   Once confirmed, a PDF letter is generated with this exact table and emailed to Amit.

3.  **Data Locking**:
    *   Amit's status changes to "Resigned".
    *   He is removed from future regular payroll cycles.
