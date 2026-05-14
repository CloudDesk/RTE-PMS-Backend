# Frontend Implementation Guide - Admin Document Upload

**Last Updated:** October 14, 2025  
**API Base URL:** `http://localhost:5800` (Development) | `https://your-api-url` (Production)  
**Authentication:** Required (Cookie or JWT)

---

## 📋 **API Endpoints**

### **1. Upload Document**

**Endpoint:** `POST /documents/admin/upload`  
**Authentication:** Required  
**Content-Type:** `multipart/form-data`

---

## 🎯 **Request Fields**

### **Required Fields:**

| Field | Type | Format | Validation | Example |
|-------|------|--------|------------|---------|
| `employeeId` | String | ObjectId | Must exist in system | `"507f1f77bcf86cd799439011"` |
| `documentType` | String | Enum | One of: `Payslip`, `Timesheet`, `Other` | `"Payslip"` |
| **`documentName`** 📝 | **String** | **Text** | **Document title/label (max 200 chars)** | `"John Timesheet Jan 2025"` |
| `month` | Number | Integer | 1-12 | `10` |
| `year` | Number | Integer | 2020-2099 | `2025` |
| `file` | File | Binary | PDF, Excel, Word, etc. | `File object` |

### **Optional Fields:**

| Field | Type | Format | Description | Example |
|-------|------|--------|-------------|---------|
| `description` | String | Text | Document description | `"Monthly payslip"` |

---

## 📝 **documentName Field - Important!**

### **What is documentName?**

**documentName** is a **required text field** that acts as the **display label/title** for the document.

**Examples:**
- `"John Timesheet Jan 2025"`
- `"Sarah Payslip October 2025"`
- `"Employee Training Certificate 2025"`

### **How it Works:**

1. **Admin enters a friendly name** (e.g., "John Timesheet Jan 2025")
2. **System uses it as the file name** (e.g., saved as "John_Timesheet_Jan_2025.pdf")
3. **Extension is auto-added** from the uploaded file

### **Examples:**

```typescript
// Admin enters documentName
formData.append('documentName', 'John Timesheet Jan 2025');
// File uploaded: timesheet.xlsx
// Saved as: "John_Timesheet_Jan_2025.xlsx"

// Another example
formData.append('documentName', 'Sarah Payslip Oct 2025');
// File uploaded: payslip.pdf
// Saved as: "Sarah_Payslip_Oct_2025.pdf"
```

---

## 📤 **API Request Example**

### **cURL Example:**

```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_JWT_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "documentName=John Doe Payslip October 2025" \
  -F "month=10" \
  -F "year=2025" \
  -F "description=Monthly payslip for October" \
  -F "file=@/path/to/document.pdf"
```

---

## 📥 **API Response**

### **Success Response (200 OK):**

```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "documentId": "679235bfa892ecaccad0ccd5",
    "documentName": "John Doe Payslip October 2025",
    "fileName": "John_Doe_Payslip_October_2025.pdf",
    "employeeName": "John Doe",
    "documentType": "Payslip",
    "month": 10,
    "year": 2025,
    "uploadedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

### **Error Responses:**

#### **400 Bad Request - Missing File:**
```json
{
  "success": false,
  "error": "No file uploaded"
}
```

#### **400 Bad Request - Missing Fields:**
```json
{
  "success": false,
  "error": "Missing required fields: employeeId, documentType, month, year"
}
```

#### **400 Bad Request - Invalid Month:**
```json
{
  "success": false,
  "error": "Month must be between 1 and 12"
}
```

#### **400 Bad Request - Invalid Year:**
```json
{
  "success": false,
  "error": "Year must be between 2020 and 2099"
}
```

#### **400 Bad Request - Invalid Document Type:**
```json
{
  "success": false,
  "error": "Document type must be Payslip, Timesheet, or Other"
}
```

#### **500 Internal Server Error:**
```json
{
  "success": false,
  "error": "Internal server error: Employee with ID xxx not found"
}
```

---

## 🎨 **Frontend Implementation**

### **1. React/TypeScript Implementation**

```typescript
import React, { useState } from 'react';
import axios from 'axios';

interface UploadFormData {
  employeeId: string;
  documentType: 'Payslip' | 'Timesheet' | 'Other';
  documentName: string;
  month: number;
  year: number;
  description?: string;
  file: File | null;
}

interface UploadResponse {
  success: boolean;
  message?: string;
  data?: {
    documentId: string;
    documentName: string;
    fileName: string;
    employeeName: string;
    documentType: string;
    month: number;
    year: number;
    uploadedAt: string;
  };
  error?: string;
}

const AdminDocumentUpload: React.FC = () => {
  const [formData, setFormData] = useState<UploadFormData>({
    employeeId: '',
    documentType: 'Payslip',
    documentName: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
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

    // Validate file
    if (!formData.file) {
      setError('Please select a file to upload');
      setLoading(false);
      return;
    }

    // Create FormData
    const uploadData = new FormData();
    uploadData.append('employeeId', formData.employeeId);
    uploadData.append('documentType', formData.documentType);
    uploadData.append('documentName', formData.documentName);
    uploadData.append('month', formData.month.toString());
    uploadData.append('year', formData.year.toString());
    
    if (formData.description) {
      uploadData.append('description', formData.description);
    }
    
    uploadData.append('file', formData.file);

    try {
      const response = await axios.post<UploadResponse>(
        '/documents/admin/upload',
        uploadData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          },
          withCredentials: true // Important for cookie-based auth
        }
      );

      if (response.data.success) {
        setSuccess(response.data.message || 'Document uploaded successfully!');
        // Reset form
        setFormData({
          employeeId: '',
          documentType: 'Payslip',
          documentName: '',
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
          description: '',
          file: null
        });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload document');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFormData({ ...formData, file: e.target.files[0] });
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload Employee Document</h2>
      
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSubmit}>
        {/* Employee Selection */}
        <div className="form-group">
          <label>Employee *</label>
          <select
            value={formData.employeeId}
            onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
            required
          >
            <option value="">Select Employee</option>
            {/* Map your employees here */}
            <option value="507f1f77bcf86cd799439011">John Doe</option>
          </select>
        </div>

        {/* Document Type */}
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

        {/* Month */}
        <div className="form-group">
          <label>Month *</label>
          <select
            value={formData.month}
            onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
            required
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>

        {/* Year */}
        <div className="form-group">
          <label>Year *</label>
          <input
            type="number"
            value={formData.year}
            onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
            min="2020"
            max="2099"
            required
          />
        </div>

        {/* Document Name (Required) */}
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

        {/* Description (Optional) */}
        <div className="form-group">
          <label>Description (Optional)</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter description..."
            rows={3}
          />
        </div>

        {/* File Upload */}
        <div className="form-group">
          <label>File *</label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.xlsx,.xls,.docx,.doc"
            required
          />
          {formData.file && <small>Selected: {formData.file.name}</small>}
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

### **2. Vanilla JavaScript / Fetch API**

```javascript
// HTML Form
const form = document.getElementById('uploadForm');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('employeeId', document.getElementById('employeeId').value);
  formData.append('documentType', document.getElementById('documentType').value);
  formData.append('documentName', document.getElementById('documentName').value);
  formData.append('month', document.getElementById('month').value);
  formData.append('year', document.getElementById('year').value);
  
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
      credentials: 'include' // Important for cookie auth
    });

    const result = await response.json();

    if (result.success) {
      alert('Document uploaded successfully!');
      form.reset();
    } else {
      alert('Error: ' + result.error);
    }
  } catch (error) {
    alert('Upload failed: ' + error.message);
  }
});
```

---

### **3. HTML Form**

```html
<form id="uploadForm">
  <!-- Employee Selection -->
  <div class="form-group">
    <label for="employeeId">Employee *</label>
    <select id="employeeId" name="employeeId" required>
      <option value="">Select Employee</option>
      <option value="507f1f77bcf86cd799439011">John Doe</option>
      <!-- Add more employees dynamically -->
    </select>
  </div>

  <!-- Document Type -->
  <div class="form-group">
    <label for="documentType">Document Type *</label>
    <select id="documentType" name="documentType" required>
      <option value="Payslip">Payslip</option>
      <option value="Timesheet">Timesheet</option>
      <option value="Other">Other</option>
    </select>
  </div>

  <!-- Month -->
  <div class="form-group">
    <label for="month">Month *</label>
    <select id="month" name="month" required>
      <option value="1">January</option>
      <option value="2">February</option>
      <option value="3">March</option>
      <option value="4">April</option>
      <option value="5">May</option>
      <option value="6">June</option>
      <option value="7">July</option>
      <option value="8">August</option>
      <option value="9">September</option>
      <option value="10">October</option>
      <option value="11">November</option>
      <option value="12">December</option>
    </select>
  </div>

  <!-- Year -->
  <div class="form-group">
    <label for="year">Year *</label>
    <input 
      type="number" 
      id="year" 
      name="year" 
      min="2020" 
      max="2099" 
      value="2025"
      required 
    />
  </div>

  <!-- Document Name (Required) -->
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

  <!-- Description (Optional) -->
  <div class="form-group">
    <label for="description">Description (Optional)</label>
    <textarea 
      id="description" 
      name="description" 
      rows="3"
      placeholder="Enter description..."
    ></textarea>
  </div>

  <!-- File Upload -->
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

  <!-- Submit Button -->
  <button type="submit">Upload Document</button>
</form>
```

---

## 📊 **Get Uploaded Documents**

### **Endpoint:** `GET /documents/admin/uploads`

### **Query Parameters:**

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `employeeId` | String | No | Filter by employee | `507f1f77bcf86cd799439011` |
| `documentType` | String | No | Filter by type | `Payslip` |
| `month` | Number | No | Filter by month (1-12) | `10` |
| `year` | Number | No | Filter by year | `2025` |
| `page` | Number | No | Page number (default: 1) | `1` |
| `limit` | Number | No | Items per page (default: 10, max: 100) | `10` |

### **Request Example:**

```typescript
// Fetch documents
const getDocuments = async () => {
  try {
    const response = await axios.get('/documents/admin/uploads', {
      params: {
        employeeId: '507f1f77bcf86cd799439011',
        documentType: 'Payslip',
        year: 2025,
        page: 1,
        limit: 10
      },
      withCredentials: true
    });

    console.log(response.data);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### **Response Example:**

```json
{
  "success": true,
  "data": [
    {
      "_id": "679235bfa892ecaccad0ccd5",
      "employeeId": {
        "_id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "email": "john@example.com",
        "employeeId": "EMP001"
      },
      "fileName": "John_Doe_Payslip_October_2025.pdf",
      "filePath": "https://storage.googleapis.com/...",
      "uploadDate": "2025-10-14T10:30:00.000Z",
      "metadata": {
        "adminUpload": {
          "documentType": "Payslip",
          "documentName": "John Doe Payslip October 2025",
          "month": 10,
          "year": 2025,
          "description": "October 2025 payslip",
          "uploadedAt": "2025-10-14T10:30:00.000Z"
        }
      },
      "uploadedBy": {
        "_id": "507f1f77bcf86cd799439012",
        "name": "Admin User",
        "email": "admin@example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  }
}
```

---

## 🎨 **TypeScript Interfaces**

```typescript
// Request interfaces
export interface AdminUploadRequest {
  employeeId: string;
  documentType: 'Payslip' | 'Timesheet' | 'Other';
  documentName: string;
  month: number;
  year: number;
  description?: string;
  file: File;
}

export interface GetDocumentsQuery {
  employeeId?: string;
  documentType?: 'Payslip' | 'Timesheet' | 'Other';
  month?: number;
  year?: number;
  page?: number;
  limit?: number;
}

// Response interfaces
export interface UploadResponse {
  success: boolean;
  message?: string;
  data?: {
    documentId: string;
    documentName: string;
    fileName: string;
    employeeName: string;
    documentType: string;
    month: number;
    year: number;
    uploadedAt: string;
  };
  error?: string;
}

export interface DocumentListResponse {
  success: boolean;
  data: AdminDocument[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminDocument {
  _id: string;
  employeeId: {
    _id: string;
    name: string;
    email: string;
    employeeId: string;
  };
  fileName: string;
  filePath: string;
  uploadDate: string;
  metadata: {
    adminUpload: {
      documentType: string;
      documentName: string;
      month: number;
      year: number;
      description?: string;
      uploadedAt: string;
    };
  };
  uploadedBy: {
    _id: string;
    name: string;
    email: string;
  };
}
```

---

## ✅ **Validation Rules**

### **Client-Side Validation:**

```typescript
const validateForm = (data: UploadFormData): string | null => {
  // Employee ID
  if (!data.employeeId || data.employeeId.trim() === '') {
    return 'Employee is required';
  }

  // Document Type
  if (!['Payslip', 'Timesheet', 'Other'].includes(data.documentType)) {
    return 'Invalid document type';
  }

  // Month
  if (data.month < 1 || data.month > 12) {
    return 'Month must be between 1 and 12';
  }

  // Year
  if (data.year < 2020 || data.year > 2099) {
    return 'Year must be between 2020 and 2099';
  }

  // File
  if (!data.file) {
    return 'File is required';
  }

  // File size (optional - e.g., max 150MB)
  const maxSize = 150 * 1024 * 1024; // 150MB
  if (data.file.size > maxSize) {
    return 'File size must be less than 150MB';
  }

  // File type (optional)
  const allowedTypes = [
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (!allowedTypes.includes(data.file.type)) {
    return 'Invalid file type. Allowed: PDF, Excel, Word';
  }

  return null; // No errors
};
```

---

## 🔧 **API Service (Axios)**

```typescript
// services/adminDocumentService.ts
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export const adminDocumentService = {
  // Upload document
  uploadDocument: async (data: FormData) => {
    const response = await axios.post(
      `${API_BASE_URL}/documents/admin/upload`,
      data,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        withCredentials: true
      }
    );
    return response.data;
  },

  // Get documents
  getDocuments: async (params?: GetDocumentsQuery) => {
    const response = await axios.get(
      `${API_BASE_URL}/documents/admin/uploads`,
      {
        params,
        withCredentials: true
      }
    );
    return response.data;
  },

  // Download document
  downloadDocument: (fileUrl: string) => {
    window.open(fileUrl, '_blank');
  }
};
```

---

## 🎯 **Complete Example: Upload & List**

```typescript
import React, { useState, useEffect } from 'react';
import { adminDocumentService } from './services/adminDocumentService';

const AdminDocumentPage: React.FC = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load documents
  const loadDocuments = async () => {
    try {
      const response = await adminDocumentService.getDocuments({
        page: 1,
        limit: 10
      });
      setDocuments(response.data);
    } catch (error) {
      console.error('Error loading documents:', error);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  // Upload handler
  const handleUpload = async (formData: FormData) => {
    setLoading(true);
    try {
      await adminDocumentService.uploadDocument(formData);
      alert('Document uploaded successfully!');
      loadDocuments(); // Reload list
    } catch (error: any) {
      alert('Error: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Upload Form Component */}
      <AdminDocumentUpload onUpload={handleUpload} loading={loading} />

      {/* Documents List */}
      <DocumentList documents={documents} />
    </div>
  );
};
```

---

## 📝 **Notes**

1. **Authentication:** Ensure cookie-based auth is enabled with `withCredentials: true`
2. **File Size:** Default limit is 150MB (configured in multer)
3. **File Types:** Supports PDF, Excel, Word documents
4. **Custom fileName:** Optional - auto-generates if not provided
5. **Error Handling:** Always handle API errors gracefully
6. **Loading States:** Show loading indicators during upload/fetch
7. **Validation:** Implement both client-side and rely on server-side validation

---

## 🚀 **Quick Start**

1. Copy the TypeScript interfaces to your project
2. Implement the upload form component
3. Create the API service with axios
4. Handle success/error states
5. Test with actual employee data

---

**Status:** ✅ Ready for frontend implementation  
**API Version:** 1.0  
**Last Tested:** October 14, 2025

