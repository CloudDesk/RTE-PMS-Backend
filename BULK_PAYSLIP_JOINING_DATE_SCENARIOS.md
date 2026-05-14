# Bulk Payslip Upload - Joining Date Scenarios

**Date:** January 2025  
**Status:** ✅ **SCENARIOS DEFINED**  
**Requirement:** Validate payslip uploads based on employee joining date

---

## 🎯 Two Key Scenarios

### **Scenario 1: Employee Joined in January** ✅

**Employee Details:**
- **Joining Date:** January 15, 2025
- **Upload Year:** 2025

**Valid Months:**
- ✅ Can upload: **12 months** (January through December 2025)
- ✅ Valid months: `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`

**Example Request:**
```
POST /documents/payslip/admin/upload/year
- employeeId: "123"
- year: 2025
- file_01: January payslip
- file_02: February payslip
- ...
- file_12: December payslip
```

**Expected Result:**
- ✅ All 12 files accepted
- ✅ All 12 payslips created
- ✅ Response: `{ uploaded: 12, failed: 0 }`

---

### **Scenario 2: Employee Joined in March** ✅

**Employee Details:**
- **Joining Date:** March 10, 2025
- **Upload Year:** 2025

**Valid Months:**
- ✅ Can upload: **10 months** (March through December 2025)
- ✅ Valid months: `[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`
- ❌ Cannot upload: January (month 1) and February (month 2)

**Example Request:**
```
POST /documents/payslip/admin/upload/year
- employeeId: "456"
- year: 2025
- file_03: March payslip
- file_04: April payslip
- ...
- file_12: December payslip
```

**Expected Result:**
- ✅ 10 files accepted (months 3-12)
- ✅ 10 payslips created
- ✅ Response: `{ uploaded: 10, failed: 0 }`

**If Trying to Upload Months 1-2:**
- ❌ Request rejected with error:
  ```
  "Cannot upload payslips for months: January, February. 
   Employee joined on 2025-03-10 (March 2025). 
   Valid months for 2025: March, April, May, June, July, August, September, October, November, December"
  ```

---

## 📋 Validation Rules

### **Rule 1: Same Year as Joining** ✅
**If upload year === joining year:**
- Valid months = `[joiningMonth, joiningMonth+1, ..., 12]`
- Example: Joined March → Valid: `[3, 4, 5, 6, 7, 8, 9, 10, 11, 12]`

### **Rule 2: Future Year** ✅
**If upload year > joining year:**
- Valid months = `[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]` (all 12 months)
- Example: Joined March 2025, upload 2026 → Valid: All 12 months

### **Rule 3: Past Year** ❌
**If upload year < joining year:**
- Invalid: Cannot upload payslips for year before employee joined
- Error: `"Cannot upload payslips for year 2024. Employee joined on 2025-03-10 (year 2025)"`

---

## 🔍 Implementation Logic

### **Step 1: Get Employee Joining Date**
```typescript
const employee = await User.findById(employeeId);
const joiningDate = new Date(employee.joiningDate);
const joiningYear = joiningDate.getFullYear();
const joiningMonth = joiningDate.getMonth() + 1; // 1-12
```

### **Step 2: Calculate Valid Months**
```typescript
let validMonths: number[] = [];

if (uploadYear === joiningYear) {
    // Same year: from joining month to December
    validMonths = Array.from(
        { length: 12 - joiningMonth + 1 }, 
        (_, i) => joiningMonth + i
    );
    // Example: joiningMonth=3 → [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
} else if (uploadYear > joiningYear) {
    // Future year: all 12 months
    validMonths = Array.from({ length: 12 }, (_, i) => i + 1);
    // [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
} else {
    // Past year: invalid
    throw new Error(`Cannot upload payslips for year ${uploadYear}. Employee joined in ${joiningYear}`);
}
```

### **Step 3: Validate Uploaded Months**
```typescript
const uploadedMonths = Array.from(filesMap.keys());
const invalidMonths = uploadedMonths.filter(month => !validMonths.includes(month));

if (invalidMonths.length > 0) {
    throw new Error(
        `Cannot upload payslips for months: ${invalidMonths.join(', ')}. ` +
        `Employee joined on ${joiningDate.toISOString().split('T')[0]}. ` +
        `Valid months for ${uploadYear}: ${validMonths.join(', ')}`
    );
}
```

---

## ✅ Examples

### **Example 1: January Joining**
```
Joining Date: 2025-01-15
Upload Year: 2025
Valid Months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
Files Uploaded: file_01, file_02, ..., file_12
Result: ✅ All 12 accepted
```

### **Example 2: March Joining**
```
Joining Date: 2025-03-10
Upload Year: 2025
Valid Months: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
Files Uploaded: file_03, file_04, ..., file_12
Result: ✅ 10 accepted

If uploaded: file_01, file_02
Result: ❌ Rejected - "Cannot upload for months: January, February"
```

### **Example 3: March Joining, Upload Next Year**
```
Joining Date: 2025-03-10
Upload Year: 2026
Valid Months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] (all months)
Files Uploaded: file_01, file_02, ..., file_12
Result: ✅ All 12 accepted (future year, all months valid)
```

### **Example 4: March Joining, Upload Past Year**
```
Joining Date: 2025-03-10
Upload Year: 2024
Result: ❌ Rejected - "Cannot upload payslips for year 2024. Employee joined in 2025"
```

---

## 🛡️ No Breaking Changes

### **Existing Logic Unchanged:**
- ✅ Single payslip upload endpoint unchanged
- ✅ Employee retrieval unchanged
- ✅ Document structure unchanged
- ✅ Existing validation logic unchanged

### **New Validation Added:**
- ✅ Joining date validation for bulk upload
- ✅ Month validation based on joining date
- ✅ Clear error messages for invalid months

---

## 📊 Summary

| Scenario | Joining Date | Upload Year | Valid Months | Files to Upload |
|---------|-------------|-------------|--------------|-----------------|
| 1 | Jan 2025 | 2025 | 1-12 | file_01 to file_12 (12 files) |
| 2 | March 2025 | 2025 | 3-12 | file_03 to file_12 (10 files) |
| 3 | March 2025 | 2026 | 1-12 | file_01 to file_12 (12 files) |
| 4 | March 2025 | 2024 | ❌ None | ❌ Rejected |

---

**End of Scenarios Document**
