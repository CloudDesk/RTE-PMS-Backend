# 🎯 FRONTEND FINAL GUIDE - Admin Document Upload

**Last Updated:** October 14, 2025  
**API:** `http://localhost:5800`  
**Status:** ✅ **100% COMPLETE - READY TO IMPLEMENT**

---

## 📋 **FORM FIELDS (6 Total)**

### **Required Fields (5):**

| Field | Type | UI Control | Format | Example |
|-------|------|------------|--------|---------|
| `employeeId` | String | Dropdown | ObjectId | "507f1f77bcf86cd799439011" |
| `documentType` | Enum | Dropdown | Payslip/Timesheet/Other | "Timesheet" |
| `documentName` | String | Text Input | Max 200 chars | "John Timesheet Jan 2025" |
| `documentDate` | Date | Date Picker | YYYY-MM-DD | "2025-01-15" |
| `file` | File | File Input | PDF/Excel/Word | File object |

### **Optional Fields (1):**

| Field | Type | UI Control | Format | Example |
|-------|------|------------|--------|---------|
| `description` | String | Textarea | Text | "Monthly timesheet" |

---

## 🎨 **HTML FORM (Copy & Paste Ready)**

```html
<form id="documentUploadForm" enctype="multipart/form-data">
  <!-- 1. Employee Dropdown -->
  <div class="form-group">
    <label for="employeeId">Employee *</label>
    <select id="employeeId" name="employeeId" required>
      <option value="">Select Employee</option>
      <!-- Populate from /users API -->
    </select>
  </div>

  <!-- 2. Document Type Dropdown -->
  <div class="form-group">
    <label for="documentType">Document Type *</label>
    <select id="documentType" name="documentType" required>
      <option value="Payslip">Payslip</option>
      <option value="Timesheet">Timesheet</option>
      <option value="Other">Other</option>
    </select>
  </div>

  <!-- 3. Document Name Text Input -->
  <div class="form-group">
    <label for="documentName">Document Name *</label>
    <input 
      type="text" 
      id="documentName" 
      name="documentName" 
      placeholder="e.g., John Timesheet Jan 2025"
      maxlength="200"
      required
    />
    <small>Enter a friendly name for this document</small>
  </div>

  <!-- 4. Document Date Picker -->
  <div class="form-group">
    <label for="documentDate">Document Date *</label>
    <input 
      type="date" 
      id="documentDate" 
      name="documentDate" 
      required
    />
  </div>

  <!-- 5. File Upload -->
  <div class="form-group">
    <label for="file">File *</label>
    <input 
      type="file" 
      id="file" 
      name="file" 
      accept=".pdf,.xlsx,.xls,.docx,.doc"
      required
    />
  </div>

  <!-- 6. Description (Optional) -->
  <div class="form-group">
    <label for="description">Description</label>
    <textarea 
      id="description" 
      name="description" 
      rows="3"
      placeholder="Optional notes..."
    ></textarea>
  </div>

  <!-- Submit Button -->
  <button type="submit">Upload Document</button>
</form>

<script>
document.getElementById('documentUploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('employeeId', document.getElementById('employeeId').value);
  formData.append('documentType', document.getElementById('documentType').value);
  formData.append('documentName', document.getElementById('documentName').value);
  formData.append('documentDate', document.getElementById('documentDate').value);
  
  const description = document.getElementById('description').value;
  if (description) {
    formData.append('description', description);
  }
  
  const fileInput = document.getElementById('file');
  formData.append('file', fileInput.files[0]);

  try {
    const response = await fetch('/documents/admin/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });

    const result = await response.json();
    
    if (result.success) {
      alert('Document uploaded successfully!');
      e.target.reset();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    alert('Upload failed: ' + error.message);
  }
});
</script>
```

---

## ⚛️ **REACT COMPONENT (TypeScript)**

```tsx
import React, { useState } from 'react';
import axios from 'axios';

interface DocumentFormData {
  employeeId: string;
  documentType: 'Payslip' | 'Timesheet' | 'Other';
  documentName: string;
  documentDate: string;  // YYYY-MM-DD format
  description: string;
  file: File | null;
}

const AdminDocumentUpload: React.FC = () => {
  const [formData, setFormData] = useState<DocumentFormData>({
    employeeId: '',
    documentType: 'Payslip',
    documentName: '',
    documentDate: new Date().toISOString().split('T')[0],
    description: '',
    file: null
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (!formData.file) {
      setError('Please select a file');
      setLoading(false);
      return;
    }

    const uploadData = new FormData();
    uploadData.append('employeeId', formData.employeeId);
    uploadData.append('documentType', formData.documentType);
    uploadData.append('documentName', formData.documentName);
    uploadData.append('documentDate', formData.documentDate);
    
    if (formData.description) {
      uploadData.append('description', formData.description);
    }
    
    uploadData.append('file', formData.file);

    try {
      const response = await axios.post('/documents/admin/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true
      });

      if (response.data.success) {
        setSuccess('Document uploaded successfully!');
        // Reset form
        setFormData({
          employeeId: '',
          documentType: 'Payslip',
          documentName: '',
          documentDate: new Date().toISOString().split('T')[0],
          description: '',
          file: null
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-form">
      <h2>Upload Employee Document</h2>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Employee Dropdown */}
        <div className="form-group">
          <label>Employee *</label>
          <select
            value={formData.employeeId}
            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
            required
          >
            <option value="">Select Employee</option>
            {/* Map employees */}
          </select>
        </div>

        {/* Document Type Dropdown */}
        <div className="form-group">
          <label>Document Type *</label>
          <select
            value={formData.documentType}
            onChange={(e) => setFormData({ ...formData, documentType: e.target.value as any })}
            required
          >
            <option value="Payslip">Payslip</option>
            <option value="Timesheet">Timesheet</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Document Name Text Input */}
        <div className="form-group">
          <label>Document Name *</label>
          <input
            type="text"
            value={formData.documentName}
            onChange={(e) => setFormData({ ...formData, documentName: e.target.value })}
            placeholder="e.g., John Timesheet Jan 2025"
            maxLength={200}
            required
          />
          <small>Enter a friendly name for this document</small>
        </div>

        {/* Document Date Picker */}
        <div className="form-group">
          <label>Document Date *</label>
          <input
            type="date"
            value={formData.documentDate}
            onChange={(e) => setFormData({ ...formData, documentDate: e.target.value })}
            required
          />
        </div>

        {/* File Upload */}
        <div className="form-group">
          <label>File *</label>
          <input
            type="file"
            onChange={(e) => setFormData({ ...formData, file: e.target.files?.[0] || null })}
            accept=".pdf,.xlsx,.xls,.docx,.doc"
            required
          />
          {formData.file && <small>Selected: {formData.file.name}</small>}
        </div>

        {/* Description (Optional) */}
        <div className="form-group">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Optional notes..."
            rows={3}
          />
        </div>

        {/* Submit Button */}
        <button type="submit" disabled={loading}>
          {loading ? 'Uploading...' : 'Upload Document'}
        </button>
      </form>
    </div>
  );
};

export default AdminDocumentUpload;
```

---

## 📤 **API REQUEST**

```typescript
const formData = new FormData();
formData.append('employeeId', '507f1f77bcf86cd799439011');
formData.append('documentType', 'Timesheet');
formData.append('documentName', 'John Timesheet Jan 2025');
formData.append('documentDate', '2025-01-15');  // YYYY-MM-DD
formData.append('description', 'January timesheet');  // Optional
formData.append('file', fileObject);

const response = await axios.post('/documents/admin/upload', formData, {
  withCredentials: true
});
```

---

## 📥 **API RESPONSE**

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

## 🔍 **GET DOCUMENTS (With Date Range Filter)**

```typescript
// Get documents between dates
const response = await axios.get('/documents/admin/uploads', {
  params: {
    employeeId: '507f1f77bcf86cd799439011',  // Optional
    documentType: 'Payslip',                  // Optional
    startDate: '2025-01-01',                  // Optional
    endDate: '2025-01-31',                    // Optional
    page: 1,
    limit: 10
  },
  withCredentials: true
});
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "employeeId": { "name": "John Doe", ... },
      "fileName": "John_Timesheet_Jan_2025.xlsx",
      "metadata": {
        "adminUpload": {
          "documentName": "John Timesheet Jan 2025",
          "documentType": "Timesheet",
          "documentDate": "2025-01-15T00:00:00.000Z"
        }
      }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3 }
}
```

---

## 🗑️ **DELETE DOCUMENT**

```typescript
await axios.delete(`/documents/admin/uploads/${documentId}`, {
  withCredentials: true
});

// Response:
// { "success": true, "message": "Document deleted successfully" }
```

---

## ✅ **VALIDATION**

```typescript
const validateForm = (data: DocumentFormData): string | null => {
  if (!data.employeeId) return 'Employee is required';
  if (!data.documentType) return 'Document type is required';
  if (!data.documentName?.trim()) return 'Document name is required';
  if (!data.documentDate) return 'Document date is required';
  if (!data.file) return 'File is required';
  
  // Validate date
  const date = new Date(data.documentDate);
  if (isNaN(date.getTime())) return 'Invalid date';
  
  return null; // No errors
};
```

---

## 📊 **COMPLETE EXAMPLE**

```tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminDocumentPage = () => {
  const [employees, setEmployees] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [formData, setFormData] = useState({
    employeeId: '',
    documentType: 'Payslip',
    documentName: '',
    documentDate: new Date().toISOString().split('T')[0],
    description: '',
    file: null
  });

  // Load employees
  useEffect(() => {
    loadEmployees();
    loadDocuments();
  }, []);

  const loadEmployees = async () => {
    const res = await axios.get('/users?limit=100', { withCredentials: true });
    setEmployees(res.data.data);
  };

  const loadDocuments = async () => {
    const res = await axios.get('/documents/admin/uploads?page=1&limit=10', {
      withCredentials: true
    });
    setDocuments(res.data.data);
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    const uploadData = new FormData();
    uploadData.append('employeeId', formData.employeeId);
    uploadData.append('documentType', formData.documentType);
    uploadData.append('documentName', formData.documentName);
    uploadData.append('documentDate', formData.documentDate);
    if (formData.description) {
      uploadData.append('description', formData.description);
    }
    uploadData.append('file', formData.file);

    try {
      await axios.post('/documents/admin/upload', uploadData, {
        withCredentials: true
      });
      
      alert('Uploaded successfully!');
      loadDocuments(); // Reload list
    } catch (error) {
      alert('Error: ' + error.response?.data?.error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return;
    
    try {
      await axios.delete(`/documents/admin/uploads/${id}`, {
        withCredentials: true
      });
      loadDocuments();
    } catch (error) {
      alert('Delete failed');
    }
  };

  return (
    <div>
      {/* Upload Form */}
      <form onSubmit={handleUpload}>
        <select 
          value={formData.employeeId}
          onChange={(e) => setFormData({...formData, employeeId: e.target.value})}
          required
        >
          <option value="">Select Employee</option>
          {employees.map(emp => (
            <option key={emp._id} value={emp._id}>{emp.name}</option>
          ))}
        </select>

        <select
          value={formData.documentType}
          onChange={(e) => setFormData({...formData, documentType: e.target.value})}
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
          onChange={(e) => setFormData({...formData, file: e.target.files[0]})}
          required
        />

        <textarea
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
        />

        <button type="submit">Upload</button>
      </form>

      {/* Documents Table */}
      <table>
        <thead>
          <tr>
            <th>Document Name</th>
            <th>Employee</th>
            <th>Type</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => (
            <tr key={doc._id}>
              <td>{doc.metadata.adminUpload.documentName}</td>
              <td>{doc.employeeId.name}</td>
              <td>{doc.metadata.adminUpload.documentType}</td>
              <td>{new Date(doc.metadata.adminUpload.documentDate).toLocaleDateString()}</td>
              <td>
                <a href={doc.filePath} target="_blank">View</a>
                <button onClick={() => handleDelete(doc._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

## 🌐 **API ENDPOINTS SUMMARY**

### **1. Upload Document**
```
POST /documents/admin/upload

Body (multipart/form-data):
- employeeId: string (required)
- documentType: "Payslip"|"Timesheet"|"Other" (required)
- documentName: string (required)
- documentDate: "YYYY-MM-DD" (required)
- file: File (required)
- description: string (optional)
```

### **2. Get Documents**
```
GET /documents/admin/uploads

Query Params:
- employeeId: string (optional)
- documentType: string (optional)
- startDate: "YYYY-MM-DD" (optional)
- endDate: "YYYY-MM-DD" (optional)
- page: number (default: 1)
- limit: number (default: 10, max: 100)
```

### **3. Delete Document**
```
DELETE /documents/admin/uploads/:id

Response: { "success": true, "message": "Document deleted successfully" }
```

---

## ✅ **FINAL CHECKLIST**

- [x] Backend complete
- [x] Date field implemented (replaced month/year)
- [x] File handling fixed
- [x] 3 API endpoints working
- [x] 0 Linting errors
- [ ] Frontend form implementation
- [ ] Test upload
- [ ] Deploy

---

## 🎯 **QUICK START**

1. Copy the React component above
2. Install axios if needed: `npm install axios`
3. Use the component in your admin panel
4. Test upload with a real file
5. Verify document appears in the list

---

**Everything is ready! Start testing your uploads!** 🚀

