# ✅ FINAL - Admin Document Upload Fields

**Last Updated:** October 14, 2025  
**Status:** Complete & Ready

---

## 📋 **FINAL FORM FIELDS**

### **Required Fields (5):**

| # | Field Name | Type | UI Control | Example Value |
|---|------------|------|------------|---------------|
| 1 | `employeeId` | String | **Dropdown** | "507f1f77bcf86cd799439011" |
| 2 | `documentType` | Enum | **Dropdown** | "Payslip" / "Timesheet" / "Other" |
| 3 | `documentName` | String | **Text Input** | "John Timesheet Jan 2025" |
| 4 | `documentDate` | Date | **Date Picker** | "2025-01-15" (YYYY-MM-DD) |
| 5 | `file` | File | **File Input** | PDF/Excel/Word file |

### **Optional Fields (1):**

| # | Field Name | Type | UI Control | Example Value |
|---|------------|------|------------|---------------|
| 6 | `description` | String | **Textarea** | "Monthly timesheet for January" |

---

## 🎨 **HTML Form**

```html
<form id="uploadForm">
  <!-- 1. Employee Dropdown -->
  <label>Employee *</label>
  <select name="employeeId" required>
    <option value="">Select Employee</option>
    <!-- Fetch from API -->
  </select>

  <!-- 2. Document Type Dropdown -->
  <label>Document Type *</label>
  <select name="documentType" required>
    <option value="Payslip">Payslip</option>
    <option value="Timesheet">Timesheet</option>
    <option value="Other">Other</option>
  </select>

  <!-- 3. Document Name Text Input -->
  <label>Document Name *</label>
  <input 
    type="text" 
    name="documentName" 
    placeholder="e.g., John Timesheet Jan 2025"
    maxlength="200"
    required
  />

  <!-- 4. Document Date Picker -->
  <label>Document Date *</label>
  <input 
    type="date" 
    name="documentDate" 
    required
  />

  <!-- 5. File Upload -->
  <label>File *</label>
  <input 
    type="file" 
    name="file" 
    accept=".pdf,.xlsx,.xls,.docx,.doc"
    required
  />

  <!-- 6. Description (Optional) -->
  <label>Description</label>
  <textarea 
    name="description" 
    placeholder="Optional notes"
  ></textarea>

  <button type="submit">Upload Document</button>
</form>
```

---

## 💻 **React/TypeScript**

```tsx
import React, { useState } from 'react';

interface FormData {
  employeeId: string;
  documentType: 'Payslip' | 'Timesheet' | 'Other';
  documentName: string;
  documentDate: string;  // YYYY-MM-DD format
  description: string;
  file: File | null;
}

const AdminDocumentUpload = () => {
  const [formData, setFormData] = useState<FormData>({
    employeeId: '',
    documentType: 'Payslip',
    documentName: '',
    documentDate: new Date().toISOString().split('T')[0],  // Today's date
    description: '',
    file: null
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const uploadData = new FormData();
    uploadData.append('employeeId', formData.employeeId);
    uploadData.append('documentType', formData.documentType);
    uploadData.append('documentName', formData.documentName);
    uploadData.append('documentDate', formData.documentDate);
    if (formData.description) {
      uploadData.append('description', formData.description);
    }
    uploadData.append('file', formData.file!);

    const response = await fetch('/documents/admin/upload', {
      method: 'POST',
      body: uploadData,
      credentials: 'include'
    });

    const result = await response.json();
    if (result.success) {
      alert('Document uploaded!');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <select 
        value={formData.employeeId}
        onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
        required
      >
        <option value="">Select Employee</option>
      </select>

      <select
        value={formData.documentType}
        onChange={(e) => setFormData({...formData, documentType: e.target.value as any})}
        required
      >
        <option value="Payslip">Payslip</option>
        <option value="Timesheet">Timesheet</option>
        <option value="Other">Other</option>
      </select>

      <input 
        type="text"
        value={formData.documentName}
        onChange={(e) => setFormData({...formData, documentName: e.target.value})}
        placeholder="e.g., John Timesheet Jan 2025"
        required
      />

      <input 
        type="date"
        value={formData.documentDate}
        onChange={(e) => setFormData({...formData, documentDate: e.target.value})}
        required
      />

      <input 
        type="file"
        onChange={(e) => setFormData({...formData, file: e.target.files?.[0] || null})}
        required
      />

      <textarea
        value={formData.description}
        onChange={(e) => setFormData({...formData, description: e.target.value})}
      />

      <button type="submit">Upload</button>
    </form>
  );
};
```

---

## 📤 **API Request**

```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Timesheet" \
  -F "documentName=John Timesheet Jan 2025" \
  -F "documentDate=2025-01-15" \
  -F "description=January timesheet" \
  -F "file=@document.xlsx"
```

---

## 📥 **API Response**

```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "documentId": "679235bfa892ecaccad0ccd5",
    "documentName": "John Timesheet Jan 2025",
    "fileName": "John_Timesheet_Jan_2025.xlsx",
    "employeeName": "John Doe",
    "documentType": "Timesheet",
    "documentDate": "2025-01-15T00:00:00.000Z",
    "uploadedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

---

## 🔍 **Get Documents with Date Filter**

```bash
# Get documents between dates
GET /documents/admin/uploads?startDate=2025-01-01&endDate=2025-01-31

# Get documents for specific employee and date range
GET /documents/admin/uploads?employeeId=xxx&startDate=2025-01-01&endDate=2025-12-31

# Get payslips for 2025
GET /documents/admin/uploads?documentType=Payslip&startDate=2025-01-01&endDate=2025-12-31
```

---

## ✅ **Summary**

**Changed from:**
- ❌ month (1-12)
- ❌ year (2020-2099)

**Changed to:**
- ✅ documentDate (single date field)

**Example:**
```javascript
// Old
month: 1, year: 2025

// New
documentDate: "2025-01-15"  // YYYY-MM-DD
```

---

**Status:** ✅ Complete and ready to use!

