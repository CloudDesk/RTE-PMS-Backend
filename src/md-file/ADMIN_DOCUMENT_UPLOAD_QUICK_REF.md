# Admin Document Upload - Quick Reference

**Last Updated:** October 14, 2025

---

## 🚀 **Quick Start**

### **Upload a Document**

```bash
POST /documents/admin/upload
Content-Type: multipart/form-data

Fields:
- employeeId: "507f1f77bcf86cd799439011"
- documentType: "Payslip" | "Timesheet" | "Other"
- month: 1-12
- year: 2020-2099
- description: "Optional description"
- file: [PDF/Excel/DOCX file]
```

### **Get Documents**

```bash
GET /documents/admin/uploads?employeeId=xxx&documentType=Payslip&month=10&year=2025&page=1&limit=10
```

---

## 📊 **Document Types**

| Type | Category | Use Case |
|------|----------|----------|
| **Payslip** | Payroll | Manual payslip uploads |
| **Timesheet** | Timesheet | Timesheet files for record |
| **Other** | EmployeeLifecycle | Any other employee document |

---

## 🎯 **Field Validation**

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| employeeId | String | ✅ Yes | Must exist in database |
| documentType | Enum | ✅ Yes | Payslip, Timesheet, Other |
| month | Number | ✅ Yes | 1-12 |
| year | Number | ✅ Yes | 2020-2099 |
| fileName | String | ❌ No | Custom file name (optional) |
| description | String | ❌ No | Optional text |
| file | File | ✅ Yes | PDF, Excel, DOCX |

---

## 📁 **File Naming**

**Format:**
```
AdminUpload_{DocumentType}_{EmployeeName}_{Month}_{Year}.{ext}
```

**Examples:**
- `AdminUpload_Payslip_John_Doe_October_2025.pdf`
- `AdminUpload_Timesheet_Jane_Smith_September_2025.xlsx`

---

## 🔍 **Search & Filter**

**Get all payslips for an employee:**
```bash
GET /documents/admin/uploads?employeeId=507f1f77bcf86cd799439011&documentType=Payslip
```

**Get all documents for October 2025:**
```bash
GET /documents/admin/uploads?month=10&year=2025
```

**Get all timesheets with pagination:**
```bash
GET /documents/admin/uploads?documentType=Timesheet&page=1&limit=20
```

---

## 🧪 **Testing Commands**

### **Upload Payslip (with custom fileName)**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Payslip" \
  -F "month=10" \
  -F "year=2025" \
  -F "fileName=Payslip_October_2025" \
  -F "description=October payslip" \
  -F "file=@payslip.pdf"

# fileName is optional - if not provided, auto-generates name
```

### **Upload Timesheet**
```bash
curl -X POST "http://localhost:5800/documents/admin/upload" \
  -H "Cookie: access_token=YOUR_TOKEN" \
  -F "employeeId=507f1f77bcf86cd799439011" \
  -F "documentType=Timesheet" \
  -F "month=9" \
  -F "year=2025" \
  -F "file=@timesheet.xlsx"
```

### **Get Documents**
```bash
curl -X GET "http://localhost:5800/documents/admin/uploads?documentType=Payslip&year=2025" \
  -H "Cookie: access_token=YOUR_TOKEN"
```

---

## 📝 **Response Examples**

### **Upload Success**
```json
{
  "success": true,
  "message": "Document uploaded successfully",
  "data": {
    "documentId": "679235bfa892ecaccad0ccd5",
    "fileName": "AdminUpload_Payslip_John_Doe_October_2025.pdf",
    "employeeName": "John Doe",
    "documentType": "Payslip",
    "month": 10,
    "year": 2025,
    "uploadedAt": "2025-10-14T10:30:00.000Z"
  }
}
```

### **Get Documents Response**
```json
{
  "success": true,
  "data": [
    {
      "_id": "679235bfa892ecaccad0ccd5",
      "employeeId": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "fileName": "AdminUpload_Payslip_John_Doe_October_2025.pdf",
      "filePath": "https://storage.googleapis.com/...",
      "uploadDate": "2025-10-14T10:30:00.000Z",
      "metadata": {
        "adminUpload": {
          "documentType": "Payslip",
          "month": 10,
          "year": 2025,
          "uploadedAt": "2025-10-14T10:30:00.000Z"
        }
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

## ❌ **Error Codes**

| Code | Error | Solution |
|------|-------|----------|
| 400 | No file uploaded | Include file in request |
| 400 | Missing required fields | Provide all required fields |
| 400 | Month must be between 1 and 12 | Use valid month number |
| 400 | Year must be between 2020 and 2099 | Use valid year |
| 400 | Invalid document type | Use Payslip, Timesheet, or Other |
| 500 | Employee not found | Use valid employee ID |
| 500 | GCP upload failed | Check GCP configuration |

---

## 🗂️ **Database Queries**

**Get all admin uploads:**
```javascript
db.documents.find({ type: 'AdminUpload' })
```

**Get payslips for employee:**
```javascript
db.documents.find({
  type: 'AdminUpload',
  employeeId: ObjectId('507f1f77bcf86cd799439011'),
  'metadata.adminUpload.documentType': 'Payslip'
})
```

**Count by document type:**
```javascript
db.documents.aggregate([
  { $match: { type: 'AdminUpload' } },
  { $group: {
      _id: '$metadata.adminUpload.documentType',
      count: { $sum: 1 }
  }}
])
```

---

## 🎨 **Frontend Integration**

### **Upload Form (HTML)**
```html
<form id="uploadForm">
  <select name="employeeId" required>
    <option value="">Select Employee</option>
  </select>
  
  <select name="documentType" required>
    <option value="Payslip">Payslip</option>
    <option value="Timesheet">Timesheet</option>
    <option value="Other">Other</option>
  </select>
  
  <input type="number" name="month" min="1" max="12" required>
  <input type="number" name="year" min="2020" max="2099" required>
  <textarea name="description"></textarea>
  <input type="file" name="file" accept=".pdf,.xlsx,.docx" required>
  
  <button type="submit">Upload</button>
</form>
```

### **Upload with Axios**
```javascript
const formData = new FormData();
formData.append('employeeId', '507f1f77bcf86cd799439011');
formData.append('documentType', 'Payslip');
formData.append('month', '10');
formData.append('year', '2025');
formData.append('file', fileInput.files[0]);

axios.post('/documents/admin/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
  withCredentials: true
})
.then(response => console.log('Uploaded!', response.data))
.catch(error => console.error('Error:', error));
```

---

## 🔒 **Security**

- ✅ Requires authentication (JWT/Cookie)
- ✅ Admin/HR role recommended
- ✅ Files stored in private GCP bucket
- ✅ Audit trail maintained
- ✅ File size limits enforced

---

## 📚 **Documentation**

**Full Guide:** `ADMIN_DOCUMENT_UPLOAD_IMPLEMENTATION.md`  
**API Docs:** `/documentation` (Swagger UI)  
**Swagger Tag:** `Documents`

---

## ✅ **Checklist**

- [ ] Get employee list API
- [ ] Implement upload form UI
- [ ] Implement document list UI
- [ ] Add search/filter controls
- [ ] Add role-based access
- [ ] Test file upload
- [ ] Test pagination
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Deploy to production

---

**Status:** ✅ **Backend Complete - Ready for Frontend Integration**

