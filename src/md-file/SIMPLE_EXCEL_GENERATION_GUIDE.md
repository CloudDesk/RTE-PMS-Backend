# Simple Excel Generation - Basic Overview

## 🎯 Core Logic Flow

```
1. API Endpoint receives: PUC + page + limit (optional)
2. Query Database with filters and pagination
3. Create Excel workbook
4. Add headers and bind data
5. Convert to buffer
6. Return to frontend
```

## 📋 Basic Implementation

### Step 1: API Route (Simple)

```typescript
// routes/excel.routes.ts
fastify.get('/generate-excel', async (request, reply) => {
  try {
    const { puc, page = 1, limit = 500 } = request.query as any;
    
    // Generate Excel with data
    const excelBuffer = await excelService.generateExcel(puc, page, limit);
    
    // Set headers for download
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename="data_export.xlsx"');
    
    return reply.send(excelBuffer);
  } catch (error: any) {
    return reply.status(500).send({ error: error.message });
  }
});
```

### Step 2: Service Method (Core Logic)

```typescript
// services/excel.service.ts
import * as ExcelJS from 'exceljs';

export class ExcelService {
  
  async generateExcel(puc: string, page: number = 1, limit: number = 500): Promise<Buffer> {
    
    // 1. Fetch data from database
    const data = await this.fetchData(puc, page, limit);
    
    // 2. Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');
    
    // 3. Add headers
    this.addHeaders(worksheet);
    
    // 4. Bind data to rows
    this.bindDataToRows(worksheet, data.records);
    
    // 5. Format columns
    this.formatColumns(worksheet);
    
    // 6. Convert to buffer and return
    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  // Fetch data with pagination
  private async fetchData(puc: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    
    // Your database query here
    const records = await YourModel.find({ puc: puc })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const total = await YourModel.countDocuments({ puc: puc });
    
    return {
      records,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // Add headers to Excel
  private addHeaders(worksheet: ExcelJS.Worksheet) {
    const headers = ['ID', 'Name', 'Email', 'Status', 'Created Date'];
    
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
  }

  // Bind data to Excel rows
  private bindDataToRows(worksheet: ExcelJS.Worksheet, records: any[]) {
    records.forEach(record => {
      worksheet.addRow([
        record._id?.toString(),
        record.name,
        record.email,
        record.status,
        record.createdAt ? new Date(record.createdAt).toLocaleDateString() : ''
      ]);
    });
  }

  // Format columns
  private formatColumns(worksheet: ExcelJS.Worksheet) {
    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });
    
    // Date formatting for last column
    worksheet.getColumn(5).numFmt = 'dd/mm/yyyy';
  }
}
```

### Step 3: Frontend Call (Simple)

```javascript
// Download Excel file
const downloadExcel = async (puc, page = 1, limit = 500) => {
  try {
    const response = await fetch(`/api/generate-excel?puc=${puc}&page=${page}&limit=${limit}`);
    
    if (!response.ok) throw new Error('Download failed');
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    
    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = `data_${puc}_page_${page}.xlsx`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed:', error);
  }
};
```

## 🔧 Customizable Template

```typescript
export class SimpleExcelGenerator {
  
  async generate(filters: any, pagination: any): Promise<Buffer> {
    const { page = 1, limit = 500, ...otherFilters } = { ...filters, ...pagination };
    
    // 1. Query Database
    const data = await this.queryDatabase(otherFilters, page, limit);
    
    // 2. Create Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    
    // 3. Dynamic Headers (based on first record)
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      this.addHeaderRow(sheet, headers);
      
      // 4. Add Data Rows
      data.forEach(record => {
        const values = headers.map(header => record[header]);
        sheet.addRow(values);
      });
    }
    
    // 5. Basic Formatting
    this.applyBasicFormatting(sheet);
    
    return await workbook.xlsx.writeBuffer() as Buffer;
  }

  private async queryDatabase(filters: any, page: number, limit: number) {
    const skip = (page - 1) * limit;
    
    return await YourModel.find(filters)
      .skip(skip)
      .limit(limit)
      .lean();
  }

  private addHeaderRow(sheet: ExcelJS.Worksheet, headers: string[]) {
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCCCCC' }
      };
    });
  }

  private applyBasicFormatting(sheet: ExcelJS.Worksheet) {
    sheet.columns.forEach(column => {
      column.width = 12;
    });
  }
}
```

## 🚀 Usage Examples

### Example 1: Basic Usage
```typescript
// Route handler
app.get('/export', async (req, res) => {
  const { puc, page, limit } = req.query;
  const buffer = await excelService.generateExcel(puc, page, limit);
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="export.xlsx"');
  res.send(buffer);
});
```

### Example 2: With Multiple Filters
```typescript
// More flexible approach
app.get('/export', async (req, res) => {
  const { page = 1, limit = 500, ...filters } = req.query;
  
  const generator = new SimpleExcelGenerator();
  const buffer = await generator.generate(filters, { page, limit });
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
});
```

### Example 3: Dynamic Column Mapping
```typescript
class FlexibleExcelGenerator {
  async generateWithMapping(query: any, columnMapping: any): Promise<Buffer> {
    const { page = 1, limit = 500 } = query;
    const skip = (page - 1) * limit;
    
    // 1. Fetch data
    const records = await Model.find(query).skip(skip).limit(limit).lean();
    
    // 2. Create workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');
    
    // 3. Add mapped headers
    const headers = Object.values(columnMapping);
    sheet.addRow(headers);
    
    // 4. Add mapped data
    records.forEach(record => {
      const row = Object.keys(columnMapping).map(key => record[key]);
      sheet.addRow(row);
    });
    
    return await workbook.xlsx.writeBuffer() as Buffer;
  }
}

// Usage:
const columnMapping = {
  '_id': 'ID',
  'name': 'Full Name', 
  'email': 'Email Address',
  'status': 'Current Status'
};

const buffer = await generator.generateWithMapping({ puc: 'ABC123' }, columnMapping);
```

## 📊 Key Points

1. **Simple Input**: `puc + page + limit`
2. **Database Query**: Filter by PUC with pagination
3. **Excel Creation**: Headers + Data binding
4. **Buffer Return**: Convert workbook to buffer
5. **Frontend Download**: Blob + download link

## 🎯 Minimal Working Example

```typescript
// Complete minimal example
export const generateSimpleExcel = async (puc: string, page = 1, limit = 500) => {
  // 1. Get data
  const records = await Model.find({ puc }).skip((page-1) * limit).limit(limit);
  
  // 2. Create Excel
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Data');
  
  // 3. Headers
  sheet.addRow(['ID', 'Name', 'Value']);
  
  // 4. Data
  records.forEach(r => sheet.addRow([r._id, r.name, r.value]));
  
  // 5. Return buffer
  return await workbook.xlsx.writeBuffer();
};
```

This covers the basic logic you need: receive parameters, query database, create Excel with headers and data, return buffer to frontend!

## 📤 Upload, Parse & Confirm Flow

### 🔄 Complete Flow Diagram

```
1. Frontend uploads Excel file
2. Backend parses Excel → Extract data
3. Backend validates data → Return validation results
4. Frontend shows preview with errors/warnings
5. Frontend confirms → Backend inserts valid data
```

### Step 1: Upload & Parse API Routes

```typescript
// routes/excel.routes.ts
import multer from '@fastify/multipart';

// Upload and parse Excel file (Step 1: Preview)
fastify.post('/import/preview', async (request, reply) => {
  try {
    // Get uploaded file
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    // Convert stream to buffer
    const fileBuffer = await data.toBuffer();
    
    // Parse Excel file
    const parsedData = await excelService.parseExcelFile(fileBuffer);
    
    // Validate data
    const validationResult = await excelService.validateData(parsedData);
    
    return reply.send({
      success: true,
      data: validationResult
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      error: { message: error.message }
    });
  }
});

// Confirm and insert valid data (Step 2: Commit)
fastify.post('/import/commit', async (request, reply) => {
  try {
    const { validRows } = request.body as any;
    
    const result = await excelService.confirmAndInsert(validRows);
    
    return reply.send({
      success: true,
      data: result
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      error: { message: error.message }
    });
  }
});
```

### Step 2: Parse & Validation Service Methods

```typescript
// Parse Excel file and extract data
async parseExcelFile(fileBuffer: Buffer): Promise<IUploadRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  
  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) throw new Error('No worksheet found');

  const rows: IUploadRow[] = [];
  let rowNumber = 2; // Skip header row

  worksheet.eachRow((row, index) => {
    if (index === 1) return; // Skip header

    const rowData: IUploadRow = {
      rowNumber,
      name: this.getCellValue(row, 1),
      email: this.getCellValue(row, 2),
      status: this.getCellValue(row, 3),
    };

    if (rowData.name && rowData.email) {
      rows.push(rowData);
    }
    rowNumber++;
  });

  return rows;
}

// Validate parsed data
async validateData(rows: IUploadRow[]): Promise<IValidationResult> {
  const validRows: IUploadRow[] = [];
  const invalidRows: IUploadRow[] = [];
  const errors: IValidationError[] = [];

  for (const row of rows) {
    const rowErrors: IValidationError[] = [];

    // Validate required fields
    if (!row.name?.trim()) {
      rowErrors.push({
        rowNumber: row.rowNumber,
        field: 'name',
        message: 'Name is required',
        severity: 'error'
      });
    }

    // Validate email format
    if (!row.email || !this.isValidEmail(row.email)) {
      rowErrors.push({
        rowNumber: row.rowNumber,
        field: 'email',
        message: 'Invalid email format',
        severity: 'error'
      });
    }

    // Check if email exists in database
    if (row.email && this.isValidEmail(row.email)) {
      const exists = await YourModel.findOne({ email: row.email.toLowerCase() });
      if (exists) {
        rowErrors.push({
          rowNumber: row.rowNumber,
          field: 'email',
          message: 'Email already exists',
          severity: 'error'
        });
      }
    }

    // Categorize row
    const hasErrors = rowErrors.some(e => e.severity === 'error');
    if (hasErrors) {
      invalidRows.push(row);
    } else {
      validRows.push(row);
    }
    errors.push(...rowErrors);
  }

  return {
    validRows,
    invalidRows,
    errors,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      errors: errors.filter(e => e.severity === 'error').length,
      warnings: errors.filter(e => e.severity === 'warning').length,
    }
  };
}

// Confirm and insert valid data
async confirmAndInsert(validRows: IUploadRow[]) {
  const errors: string[] = [];
  let inserted = 0;

  for (const row of validRows) {
    try {
      await YourModel.create({
        name: row.name,
        email: row.email.toLowerCase(),
        status: row.status || 'active',
      });
      inserted++;
    } catch (error: any) {
      errors.push(`Row ${row.rowNumber}: ${error.message}`);
    }
  }

  return { success: errors.length === 0, inserted, errors };
}
```

### Step 3: Frontend Implementation

```javascript
// Frontend Service
class ExcelUploadService {
  
  async uploadAndParse(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/import/preview', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) throw new Error('Upload failed');
    return (await response.json()).data;
  }

  async confirmInsert(validRows) {
    const response = await fetch('/api/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ validRows })
    });

    if (!response.ok) throw new Error('Insert failed');
    return await response.json();
  }
}
```

## 🔄 Complete Flow Summary

### Phase 1: Upload & Parse
1. **Frontend**: User selects Excel file
2. **Frontend**: Uploads to `/import/preview` endpoint  
3. **Backend**: Parses Excel using ExcelJS
4. **Backend**: Validates data (required fields, duplicates)
5. **Backend**: Returns validation results

### Phase 2: Preview & Confirm
6. **Frontend**: Shows validation summary and errors
7. **Frontend**: Displays preview of valid data
8. **Frontend**: User clicks "Confirm & Insert"
9. **Backend**: Inserts valid rows into database
10. **Backend**: Returns insertion results

## 🎯 Key Features

- **Parse Excel**: Extract data from uploaded file
- **Validation**: Required fields, format, duplicates
- **Preview**: Show valid/invalid data before insert
- **Error Handling**: Detailed error messages per row
- **Confirm Insert**: Only insert validated data

This gives you a complete **upload → parse → validate → preview → confirm → insert** flow! 🚀


