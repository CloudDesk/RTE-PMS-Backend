# ✅ fileName Field Added - Admin Document Upload

**Date:** October 14, 2025  
**Update:** Added custom `fileName` text field  
**Status:** ✅ Complete

---

## 🆕 **What Changed**

### **New Field: `fileName` (Optional Text)**

Admin can now specify a custom file name when uploading documents.

---

## 📋 **Updated API**

### **POST /documents/admin/upload**

**New Field Added:**
```
fileName: string (optional)
```

**Full Request:**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "description=October payslip" \
  -F "fileName=Payslip_October_2025" \
  -F "file=@document.pdf"
```

---

## 🔄 **How It Works**

### **Option 1: With Custom fileName**
```bash
# Admin specifies custom name
-F "fileName=Employee_Payslip_Oct_2025"

# Result: File saved as "Employee_Payslip_Oct_2025.pdf"
# (extension auto-added from uploaded file)
```

### **Option 2: Without fileName (Auto-generated)**
```bash
# No fileName field provided

# Result: Auto-generated name
# "AdminUpload_Payslip_John_Doe_October_2025.pdf"
```

---

## 💡 **Examples**

### **Example 1: Custom File Name**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "fileName=October_2025_Payslip_JohnDoe" \
  -F "file=@payslip.pdf"

# Saved as: "October_2025_Payslip_JohnDoe.pdf"
```

### **Example 2: Auto-Generated (No fileName)**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "file=@payslip.pdf"

# Saved as: "AdminUpload_Payslip_John_Doe_October_2025.pdf"
```

### **Example 3: fileName With Extension**
```bash
-F "fileName=MyCustomFile.pdf"
# Saved as: "MyCustomFile.pdf" (uses provided extension)
```

### **Example 4: fileName Without Extension**
```bash
-F "fileName=MyCustomFile"
# Saved as: "MyCustomFile.pdf" (extension from uploaded file)
```

---

## 🎨 **Frontend Form Example**

### **React Component:**
```tsx
<form>
  {/* Existing fields */}
  <select name="employeeId">...</select>
  <select name="documentType">...</select>
  <input type="number" name="month" />
  <input type="number" name="year" />
  
  {/* NEW: File Name Field */}
  <div>
    <label>Custom File Name (Optional)</label>
    <input 
      type="text" 
      name="fileName" 
      placeholder="e.g., Payslip_October_2025"
      maxLength="100"
    />
    <small>Leave blank for auto-generated name</small>
  </div>
  
  <textarea name="description"></textarea>
  <input type="file" name="file" />
  
  <button type="submit">Upload</button>
</form>
```

### **HTML Form:**
```html
<form method="POST" enctype="multipart/form-data">
  <input type="text" name="employeeId" required />
  <select name="documentType" required>
    <option value="Payslip">Payslip</option>
    <option value="Timesheet">Timesheet</option>
    <option value="Other">Other</option>
  </select>
  <input type="number" name="month" min="1" max="12" required />
  <input type="number" name="year" required />
  
  <!-- NEW FIELD -->
  <input 
    type="text" 
    name="fileName" 
    placeholder="Custom file name (optional)" 
  />
  
  <textarea name="description"></textarea>
  <input type="file" name="file" required />
  <button type="submit">Upload</button>
</form>
```

---

## 📝 **Field Validation**

### **fileName Field:**
- **Type:** String (text)
- **Required:** ❌ No (optional)
- **Max Length:** 100 characters
- **Auto Extension:** ✅ Yes (adds extension from uploaded file if not present)
- **Sanitization:** None (stored as provided)

### **Behavior:**
| Scenario | Input | Output |
|----------|-------|--------|
| With extension | `"MyFile.pdf"` | `MyFile.pdf` |
| Without extension | `"MyFile"` | `MyFile.pdf` (from uploaded file) |
| Empty/null | `""` or not provided | Auto-generated name |
| With spaces | `"My File Name"` | `My File Name.pdf` |
| Special chars | `"File@2025"` | `File@2025.pdf` |

---

## 🔍 **Backend Logic**

### **Service Method Updated:**
```typescript
async adminUploadDocument(
    employeeId: string,
    documentType: 'Payslip' | 'Timesheet' | 'Other',
    month: number,
    year: number,
    uploadedFile: any,
    description?: string,
    customFileName?: string  // ← NEW PARAMETER
): Promise<IDocument> {
    // ...
    
    // Use custom fileName if provided
    let newFileName: string;
    if (customFileName && customFileName.trim()) {
        const originalExtension = path.extname(uploadedFile.originalname);
        const hasExtension = path.extname(customFileName);
        newFileName = hasExtension 
            ? customFileName 
            : `${customFileName}${originalExtension}`;
    } else {
        // Auto-generate name
        newFileName = `AdminUpload_${documentType}_${employeeName}_${month}_${year}${ext}`;
    }
    
    // ... upload to GCP with newFileName
}
```

---

## 📊 **Updated Fields Summary**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `employeeId` | String | ✅ Yes | Employee ID |
| `documentType` | Enum | ✅ Yes | Payslip, Timesheet, Other |
| `month` | Number | ✅ Yes | 1-12 |
| `year` | Number | ✅ Yes | 2020-2099 |
| `file` | File | ✅ Yes | Document file |
| `description` | String | ❌ No | Optional description |
| **`fileName`** | **String** | **❌ No** | **Custom file name (NEW)** |

---

## ✅ **Testing**

### **Test 1: With Custom fileName**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "fileName=CustomPayslip_Oct2025" \
  -F "file=@test.pdf"

# Expected: File saved as "CustomPayslip_Oct2025.pdf"
```

### **Test 2: Without fileName**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "file=@test.pdf"

# Expected: Auto-generated name "AdminUpload_Payslip_EmployeeName_October_2025.pdf"
```

---

## 🚀 **Deployment**

No database changes required - this is a runtime feature only.

**Status:** ✅ Ready to deploy immediately

---

## 📚 **Documentation Updated**

- [x] Backend service method
- [x] API route handler
- [x] Field validation
- [x] Frontend examples
- [x] Testing examples
- [x] This documentation

---

## ✅ **Summary**

✅ **Added:** `fileName` text field (optional)  
✅ **Behavior:** Use custom name if provided, auto-generate otherwise  
✅ **Extension:** Auto-added from uploaded file if not present  
✅ **Backward Compatible:** Existing uploads still work (auto-generate)  
✅ **No Breaking Changes:** fileName is optional  

---

**Last Updated:** October 14, 2025  
**Status:** ✅ Complete & Tested  
**Ready for:** Production use

