# Apply on Behalf - Document Upload Implementation

## ✅ Implementation Complete

This document describes the complete implementation of optional document upload functionality for "Apply on Behalf" feature for both Leave and WFH requests.

---

## 📋 Overview

**Feature:** Optional document uploads when admins apply for leave or WFH on behalf of employees  
**Status:** ✅ Fully Implemented  
**Endpoints:**
- `POST /leaves/apply-on-behalf` - Apply leave on behalf with optional documents
- `POST /wfh/apply-on-behalf` - Apply WFH on behalf with optional documents

---

## 🏗️ Implementation Details

### 1. Database Schema Changes

#### Leave Model (`src/models/leave.model.ts`)
```typescript
documents?: Array<{
  fileName: string;
  filePath: string;
  uploadDate: Date;
  uploadedBy?: Types.ObjectId;
}>;
```

#### WFH Model (`src/models/wfh.model.ts`)
```typescript
documents?: Array<{
  fileName: string;
  filePath: string;
  uploadDate: Date;
  uploadedBy?: Types.ObjectId;
}>;
```

### 2. Service Interface Updates

#### ILeaveCreate Interface
```typescript
documents?: Array<{
  fileName: string;
  filePath: string;
  uploadDate?: Date;
  uploadedBy?: Types.ObjectId;
}>;
```

#### IWFHCreate Interface
```typescript
documents?: Array<{
  fileName: string;
  filePath: string;
  uploadDate?: Date;
  uploadedBy?: Types.ObjectId;
}>;
```

### 3. API Endpoints

#### Leave Apply on Behalf
- **Endpoint:** `POST /leaves/apply-on-behalf`
- **Content-Type:** `multipart/form-data` (supports both file uploads and JSON-only requests)
- **Authentication:** Required (Admin only)

#### WFH Apply on Behalf
- **Endpoint:** `POST /wfh/apply-on-behalf`
- **Content-Type:** `multipart/form-data` (supports both file uploads and JSON-only requests)
- **Authentication:** Required (Admin only)

---

## 📝 Request Format

### With Documents (Multipart Form Data)

```javascript
const formData = new FormData();
formData.append('userId', '507f1f77bcf86cd799439011');
formData.append('leaveTypeId', '507f1f77bcf86cd799439012');
formData.append('startDate', '2025-01-15');
formData.append('endDate', '2025-01-17');
formData.append('reason', 'Medical emergency');
formData.append('remarks', 'Employee was hospitalized');
formData.append('leaveDuration', 'full-day');
formData.append('appliedTo', JSON.stringify({ _id: '...', name: 'Manager Name' }));
formData.append('document', file1); // Optional - can add multiple files
formData.append('document', file2); // Optional
```

### Without Documents (JSON or Form Data)

```javascript
// Can still use multipart/form-data without files
const formData = new FormData();
formData.append('userId', '507f1f77bcf86cd799439011');
formData.append('leaveTypeId', '507f1f77bcf86cd799439012');
// ... other fields

// Or use JSON body (if no files)
fetch('/api/leaves/apply-on-behalf', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId, leaveTypeId, ... })
});
```

---

## ✅ Validation & Security

### File Validation

1. **File Type Validation:**
   - Allowed extensions: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.doc`, `.docx`, `.xls`, `.xlsx`
   - Invalid file types are rejected with clear error messages

2. **File Size Validation:**
   - Maximum file size: **10MB** per file
   - Files exceeding limit are rejected

3. **Error Handling:**
   - Individual file failures don't block the entire request
   - If all files fail, request is rejected with detailed error messages
   - Partial success: If some files succeed and some fail, request proceeds with successful files

### Security

1. **Authentication:** Only admins can use apply-on-behalf endpoints
2. **Authorization:** Validates user role before processing
3. **File Sanitization:** File names are sanitized to prevent path traversal
4. **GCP Storage:** Files are stored securely in GCP Cloud Storage
5. **Temporary File Cleanup:** Local temporary files are automatically deleted after upload

---

## 📊 Response Format

### Success Response (with documents)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "leaveTypeId": "507f1f77bcf86cd799439013",
    "startDate": "2025-01-15T00:00:00.000Z",
    "endDate": "2025-01-17T00:00:00.000Z",
    "reason": "Medical emergency",
    "status": "Pending",
    "appliedOnBehalf": true,
    "appliedBy": {
      "_id": "507f1f77bcf86cd799439014",
      "name": "Admin User",
      "email": "admin@example.com"
    },
    "documents": [
      {
        "fileName": "medical_certificate.pdf",
        "filePath": "https://storage.googleapis.com/bucket/employeeId/EmployeeLifecycle/Leave_Doc_...",
        "uploadDate": "2025-01-14T10:30:00.000Z",
        "uploadedBy": "507f1f77bcf86cd799439014"
      }
    ],
    "createdAt": "2025-01-14T10:30:00.000Z",
    "updatedAt": "2025-01-14T10:30:00.000Z"
  }
}
```

### Success Response (without documents)

```json
{
  "success": true,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "documents": [] // or undefined if no documents
  }
}
```

### Error Response (validation failure)

```json
{
  "success": false,
  "error": {
    "message": "Missing required fields: userId, leaveTypeId, startDate, endDate, and reason are required"
  }
}
```

### Error Response (file upload failure)

```json
{
  "success": false,
  "error": {
    "message": "All file uploads failed",
    "details": [
      "File \"large_file.pdf\" exceeds maximum size of 10MB",
      "File \"script.exe\" has invalid extension. Allowed: .pdf, .jpg, .jpeg, .png, .doc, .docx, .xls, .xlsx"
    ]
  }
}
```

---

## 🔍 All Scenarios Covered

### ✅ Scenario 1: Request with No Documents
- **Input:** Request with only form fields, no files
- **Expected:** Leave/WFH created successfully, `documents` field is `undefined` or empty array
- **Status:** ✅ Implemented

### ✅ Scenario 2: Request with Single Document
- **Input:** Request with one valid file
- **Expected:** File uploaded to GCP, document metadata saved, leave/WFH created
- **Status:** ✅ Implemented

### ✅ Scenario 3: Request with Multiple Documents
- **Input:** Request with multiple valid files
- **Expected:** All files uploaded, all document metadata saved
- **Status:** ✅ Implemented

### ✅ Scenario 4: Request with Invalid File Type
- **Input:** Request with file having invalid extension (e.g., `.exe`, `.zip`)
- **Expected:** File rejected, error message returned, other valid files still processed
- **Status:** ✅ Implemented

### ✅ Scenario 5: Request with File Exceeding Size Limit
- **Input:** Request with file larger than 10MB
- **Expected:** File rejected, error message returned, other valid files still processed
- **Status:** ✅ Implemented

### ✅ Scenario 6: Request with Mixed Valid/Invalid Files
- **Input:** Request with some valid and some invalid files
- **Expected:** Valid files uploaded, invalid files rejected with error messages, request succeeds
- **Status:** ✅ Implemented

### ✅ Scenario 7: Request with All Files Failing
- **Input:** Request with multiple files, all failing validation or upload
- **Expected:** Request rejected with detailed error messages
- **Status:** ✅ Implemented

### ✅ Scenario 8: GCP Upload Failure
- **Input:** Valid file but GCP upload fails (network issue, permissions, etc.)
- **Expected:** File error logged, error message in response, other files still processed
- **Status:** ✅ Implemented

### ✅ Scenario 9: Missing Required Fields
- **Input:** Request missing required fields (userId, startDate, etc.)
- **Expected:** Request rejected with clear validation error
- **Status:** ✅ Implemented

### ✅ Scenario 10: Non-Admin User Attempt
- **Input:** Non-admin user tries to use apply-on-behalf endpoint
- **Expected:** 403 Forbidden error
- **Status:** ✅ Implemented

### ✅ Scenario 11: Documents Returned in API Responses
- **Input:** Retrieve leave/WFH via GET endpoints
- **Expected:** Documents array included in response
- **Status:** ✅ Implemented (documents are part of model schema, automatically included)

### ✅ Scenario 12: JSON Body Without Files
- **Input:** JSON request body (no multipart)
- **Expected:** Request processed successfully, documents field undefined
- **Status:** ✅ Implemented (graceful fallback to JSON parsing)

---

## 📁 File Storage

### GCP Cloud Storage Structure

Files are stored in GCP Cloud Storage with the following structure:

```
gs://bucket-name/
  {employeeId}/
    EmployeeLifecycle/
      Leave_Doc_{employeeId}_{timestamp}_{random}.{ext}
      WFH_Doc_{employeeId}_{timestamp}_{random}.{ext}
```

### File Naming Convention

- **Leave Documents:** `Leave_Doc_{employeeId}_{timestamp}_{random}.{ext}`
- **WFH Documents:** `WFH_Doc_{employeeId}_{timestamp}_{random}.{ext}`
- **Random Suffix:** Prevents filename collisions

### File URL Format

```
https://storage.googleapis.com/{bucket-name}/{employeeId}/EmployeeLifecycle/{filename}
```

---

## 🔧 Technical Implementation

### File Processing Flow

1. **Parse Request:** Extract form data and files using `parseMultipartForm`
2. **Validate Fields:** Check required fields are present
3. **Validate Files:** For each file:
   - Check file extension
   - Check file size
   - Save to temporary location
   - Upload to GCP
   - Clean up temporary file
4. **Create Record:** Save leave/WFH with document metadata
5. **Return Response:** Include documents in response

### Error Handling

- **Individual File Errors:** Logged but don't block request
- **All Files Fail:** Request rejected with detailed errors
- **GCP Errors:** Handled gracefully with error messages
- **Validation Errors:** Clear, specific error messages

### Performance Considerations

- Files processed in sequence (prevents memory issues)
- Temporary files cleaned up immediately after upload
- GCP uploads are async but awaited for each file
- No blocking operations

---

## 🧪 Testing Checklist

### Manual Testing

- [x] Request without documents
- [x] Request with single valid document
- [x] Request with multiple valid documents
- [x] Request with invalid file type
- [x] Request with oversized file
- [x] Request with mixed valid/invalid files
- [x] Request with GCP upload failure
- [x] Missing required fields
- [x] Non-admin user access
- [x] Documents returned in GET responses
- [x] JSON body without files

### Edge Cases

- [x] Empty file (0 bytes)
- [x] Very long filename
- [x] Special characters in filename
- [x] Multiple files with same name
- [x] Network timeout during upload
- [x] GCP bucket permissions issue

---

## 📚 Frontend Integration Guide

### Example: React/TypeScript

```typescript
interface ApplyLeaveOnBehalfRequest {
  userId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  remarks?: string;
  leaveDuration?: 'full-day' | 'half-day';
  halfDayType?: 'first-half' | 'second-half';
  appliedTo?: { _id: string; name: string };
  documents?: File[];
}

async function applyLeaveOnBehalf(data: ApplyLeaveOnBehalfRequest) {
  const formData = new FormData();
  
  // Add required fields
  formData.append('userId', data.userId);
  formData.append('leaveTypeId', data.leaveTypeId);
  formData.append('startDate', data.startDate);
  formData.append('endDate', data.endDate);
  formData.append('reason', data.reason);
  
  // Add optional fields
  if (data.remarks) formData.append('remarks', data.remarks);
  if (data.leaveDuration) formData.append('leaveDuration', data.leaveDuration);
  if (data.halfDayType) formData.append('halfDayType', data.halfDayType);
  if (data.appliedTo) formData.append('appliedTo', JSON.stringify(data.appliedTo));
  
  // Add documents (optional)
  if (data.documents && data.documents.length > 0) {
    data.documents.forEach((file) => {
      formData.append('document', file);
    });
  }
  
  const response = await fetch('/api/leaves/apply-on-behalf', {
    method: 'POST',
    headers: {
      // Don't set Content-Type header - browser will set it with boundary
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });
  
  return response.json();
}
```

### Example: Handling Response

```typescript
const result = await applyLeaveOnBehalf({
  userId: '...',
  leaveTypeId: '...',
  startDate: '2025-01-15',
  endDate: '2025-01-17',
  reason: 'Medical emergency',
  documents: [file1, file2]
});

if (result.success) {
  console.log('Leave applied successfully');
  if (result.data.documents && result.data.documents.length > 0) {
    console.log(`Uploaded ${result.data.documents.length} documents`);
    result.data.documents.forEach((doc) => {
      console.log(`- ${doc.fileName}: ${doc.filePath}`);
    });
  }
} else {
  console.error('Error:', result.error.message);
  if (result.error.details) {
    result.error.details.forEach((detail) => {
      console.error(`- ${detail}`);
    });
  }
}
```

---

## 🚀 Deployment Notes

### Environment Variables Required

- `GCP_STORAGE_BUCKET` - GCP bucket name for file storage
- `PROJECT_ID` - GCP project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to GCP service account key (or set in GCP)

### GCP Permissions

Service account needs:
- `storage.objects.create` - To upload files
- `storage.objects.get` - To read files
- `storage.objects.delete` - To delete files (if needed)

### File Size Limits

- **Current Limit:** 10MB per file
- **Configurable:** Change `MAX_FILE_SIZE` constant in route handlers
- **GCP Limit:** GCP has much higher limits (5TB per object)

---

## 📝 Summary

✅ **Complete Implementation** - All scenarios covered  
✅ **Robust Validation** - File type, size, and field validation  
✅ **Error Handling** - Comprehensive error messages  
✅ **Security** - Admin-only access, file sanitization  
✅ **Performance** - Efficient file processing  
✅ **Documentation** - Complete API documentation  

The feature is **production-ready** and handles all edge cases gracefully.

