# 🎨 Frontend Integration Guide - Final Settlement (FNF)

This guide details the API structure and new fields available in the robust Final Settlement system. Use this to update the UI to display detailed statutory breakdowns, gratuity, and accurate calculations.

---

## 📡 API Endpoint
**GET** `/final-settlement/:id`

---

## 🧩 Key Data Structure Updates
The `finalCalculation` object has been expanded. You need to map these new fields in your **Earnings** and **Deductions** tables.

### 1. New Fields in `finalCalculation`
| Field | Type | Description | UI Section |
| :--- | :--- | :--- | :--- |
| `gratuity` | `number` | **NEW**: Gratuity amount (if service > 4.6 yrs). | **Earnings** |
| `providentFund` | `number` | **NEW**: PF calculated for unpaid days. | **Deductions** |
| `esi` | `number` | **NEW**: ESI calculated for unpaid days. | **Deductions** |
| `professionalTax` | `number` | **NEW**: PT calculated for exit month. | **Deductions** |
| `isNegative` | `boolean` | **NEW**: `true` if employee owes money. | **Alert/Warning** |

### 2. Detailed `unpaidMonths` Array
The `unpaidMonths` array now contains the specific tax breakdown per month. You can show this in a **tooltip** or a **detailed view** if the user clicks on "Unpaid Salary".

```typescript
{
    "monthYear": "2024-03",
    "salary": 15000,       // Gross Unpaid Salary
    "providentFund": 1800, // Deducted from Gross
    "esi": 113,            // Deducted from Gross
    "professionalTax": 200 // Deducted from Gross
}
```

---

## 💻 UI Implementation Example

### **A. Earnings Table**
| Label | Value Key | Notes |
| :--- | :--- | :--- |
| **Hold Salary** | `finalCalculation.holdSalaries` | Released hold amounts |
| **Unpaid Salary** | `finalCalculation.unpaidSalaries` | Prorated logic |
| **Leave Encashment** | `finalCalculation.leaveEncashment` | Now based on Basic+DA |
| **Gratuity** | `finalCalculation.gratuity` | **(New)** Show only if > 0 |
| **Reimbursements** | `finalCalculation.reimbursements` | |
| **Other Additions** | `finalCalculation.otherAdditions` | |
| **TOTAL EARNINGS** | `finalCalculation.totalPayable` | |

### **B. Deductions Table**
| Label | Value Key | Notes |
| :--- | :--- | :--- |
| **Notice Recovery** | `finalCalculation.noticePeriodRecovery` | **Alert**: Check `daysServed` if LOP adjusted |
| **Provident Fund** | `finalCalculation.providentFund` | **(New)** Statutory for unpaid days |
| **Professional Tax** | `finalCalculation.professionalTax` | **(New)** Statutory for exit month |
| **ESI** | `finalCalculation.esi` | **(New)** Show only if > 0 |
| **Other Deductions** | `finalCalculation.otherDeductions` | Manual deductions |
| **TOTAL DEDUCTIONS** | `finalCalculation.totalDeductions` | |

### **C. Net Pay / Alert**
```javascript
// React/Svelte Logic
if (data.finalCalculation.isNegative) {
    return <Alert variant="destructive">⚠️ Negative Settlement! Employee owes ₹{Math.abs(data.finalCalculation.netAmount)}</Alert>;
} else {
    return <div className="text-green-600">Net Pay: ₹{data.finalCalculation.netAmount}</div>;
}
```

---

## ⚡ Real-Time JSON Example (Robust Response)
Use this JSON to mock your frontend development.

```json
{
  "success": true,
  "data": {
    "employeeName": "Rahul Sharma",
    "employeeCode": "EMP001",
    "resignationSubmittedOn": "2024-01-01T00:00:00.000Z",
    "leavingDate": "2024-03-01T00:00:00.000Z",
    
    "noticeRequired": true,
    "noticePeriodDays": 60,
    "daysServed": 50,  // Reduced because he took 10 LOPs!
    "noticePeriodRecovery": 15000, // Recovered for 10 days
    
    "unpaidMonths": [
      {
        "monthYear": "2024-03",
        "month": 3,
        "year": 2024,
        "daysWorked": 1,
        "salary": 3846,
        "professionalTax": 200,
        "providentFund": 230,  // 12% of Basic
        "esi": 29              // 0.75% of Gross
      }
    ],

    "leaveBalance": [
      {
        "leaveType": "AL",
        "balance": 15,
        "perDayRate": 800, // Calculated on Basic+DA (Not Gross)
        "encashAmount": 12000
      }
    ],

    "finalCalculation": {
      "holdSalaries": 50000,      // Jan Salary was held
      "unpaidSalaries": 3846,     // 1 Day in March
      "leaveEncashment": 12000,
      "gratuity": 75000,          // ✅ Eligible (> 4.6 Years)
      "reimbursements": 0,
      "otherAdditions": 0,
      "totalPayable": 140846,     // Sum of Earnings

      "noticePeriodRecovery": 15000,
      "professionalTax": 200,     // ✅ New Field
      "providentFund": 230,       // ✅ New Field
      "esi": 29,                  // ✅ New Field
      "otherDeductions": 5000,    // Laptop Damage
      "totalDeductions": 20459,   // Sum of Deductions

      "netAmount": 120387,
      "isNegative": false
    },
    
    "status": "Draft"
  }
}
```

## 📝 Action Items for Frontend Dev
1.  **Bind new fields**: `gratuity`, `providentFund`, `esi` in the Summary Table.
2.  **Update Deduction Total**: Ensure the UI sums up the specific statutory fields if it calculates totals client-side (though mapped `totalDeductions` from API is safer).
3.  **Add Warning**: Specific UI handling for `isNegative: true` (Red Banner).
