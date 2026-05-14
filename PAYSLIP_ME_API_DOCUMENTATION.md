# GET /payslip/me - API Documentation

## Overview
This endpoint retrieves payslip and payroll information for a specific user. It returns detailed salary breakdown including all allowances, deductions, and the GCP payslip URL.

---

## Endpoint Details

### HTTP Method
```
GET /payslip/me
```

### Authentication
- **Required**: No (authentication is commented out in the code)
- **Note**: In production, this should be protected with authentication middleware

### Base URL
```
{BASE_URL}/payslip/me
```

---

## Request Parameters

### Query Parameters

| Parameter | Type     | Required | Description                                          | Example |
|-----------|----------|----------|------------------------------------------------------|---------|
| `userId`  | `string` | ✅ Yes   | The unique identifier of the employee                | `"507f1f77bcf86cd799439011"` |
| `month`   | `number` | ❌ No    | Month for which to retrieve payslip (1-12)           | `12` |
| `year`    | `number` | ❌ No    | Year for which to retrieve payslip                   | `2024` |

### Parameter Details

#### `userId`
- **Type**: MongoDB ObjectId (string)
- **Required**: Yes
- **Description**: The unique identifier of the employee whose payslip is being requested
- **Validation**: Must be a valid MongoDB ObjectId

#### `month`
- **Type**: Number
- **Required**: No
- **Default**: If not provided, returns all months
- **Range**: 1-12 (1 = January, 12 = December)
- **Description**: Filter payslips by specific month

#### `year`
- **Type**: Number
- **Required**: No
- **Default**: If not provided, returns all years
- **Description**: Filter payslips by specific year

---

## Response Schema

### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "payslips": [
      {
        "payslipId": "string",
        "employeeId": "string",
        "employeeName": "string",
        "email": "string",
        "month": "number",
        "year": "number",
        "monthYear": "string",
        "basic": "number",
        "hra": "number",
        "da": "number",
        "otherAllowance": "number",
        "travelAllowance": "number",
        "airTicketAllowance": "number",
        "medicalAllowance": "number",
        "epfEmployee": "number",
        "professionalTax": "number",
        "incomeTax": "number",
        "overtimePay": "number",
        "grossSalary": "number",
        "netSalary": "number",
        "ctc": "number",
        "totalDeductions": "number",
        "reimbursement": "number",
        "bonus": "number",
        "payslipUrl": "string"
      }
    ]
  }
}
```

### Response Fields Description

| Field | Type | Description |
|-------|------|-------------|
| `success` | `boolean` | Indicates if the request was successful |
| `data` | `object` | Container object for the response data |
| `data.payslips` | `array` | Array of payslip records |

#### Payslip Object Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `payslipId` | `string` | Unique identifier for the payslip record | `"507f1f77bcf86cd799439011"` |
| `employeeId` | `string` | Employee's unique identifier | `"507f1f77bcf86cd799439012"` |
| `employeeName` | `string` | Full name of the employee | `"John Doe"` |
| `email` | `string` | Employee's email address | `"john.doe@company.com"` |
| `month` | `number` | Month of the payslip (1-12) | `12` |
| `year` | `number` | Year of the payslip | `2024` |
| `monthYear` | `string` | Combined month-year in YYYY-MM format | `"2024-12"` |
| `basic` | `number` | Basic salary component | `50000` |
| `hra` | `number` | House Rent Allowance | `25000` |
| `da` | `number` | Dearness Allowance | `5000` |
| `otherAllowance` | `number` | Other miscellaneous allowances | `3000` |
| `travelAllowance` | `number` | Travel/Conveyance allowance | `2000` |
| `airTicketAllowance` | `number` | Air ticket reimbursement allowance | `10000` |
| `medicalAllowance` | `number` | Medical insurance/reimbursement allowance | `1500` |
| `epfEmployee` | `number` | Employee Provident Fund deduction | `6000` |
| `professionalTax` | `number` | Professional tax deduction | `200` |
| `incomeTax` | `number` | Income tax (TDS) deduction | `5000` |
| `overtimePay` | `number` | Overtime payment | `1500` |
| `grossSalary` | `number` | Total gross salary (before deductions) | `97500` |
| `netSalary` | `number` | Net salary (take-home pay) | `86300` |
| `ctc` | `number` | Cost to Company (annual) | `1200000` |
| `totalDeductions` | `number` | Total amount deducted from gross salary | `11200` |
| `reimbursement` | `number` | Additional reimbursements | `0` |
| `bonus` | `number` | Performance bonus or incentives | `0` |
| `payslipUrl` | `string` | GCP storage URL of the generated payslip PDF | `"https://storage.googleapis.com/..."` |

### Error Response (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "message": "Error description"
  }
}
```

---

## Example Requests

### Example 1: Get All Payslips for a User

**Request:**
```bash
GET /payslip/me?userId=507f1f77bcf86cd799439011
```

**cURL:**
```bash
curl -X GET "https://api.example.com/payslip/me?userId=507f1f77bcf86cd799439011"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payslips": [
      {
        "payslipId": "65a1b2c3d4e5f6789abcdef0",
        "employeeId": "507f1f77bcf86cd799439011",
        "employeeName": "John Doe",
        "email": "john.doe@company.com",
        "month": 12,
        "year": 2024,
        "monthYear": "2024-12",
        "basic": 50000,
        "hra": 25000,
        "da": 5000,
        "otherAllowance": 3000,
        "travelAllowance": 2000,
        "airTicketAllowance": 10000,
        "medicalAllowance": 1500,
        "epfEmployee": 6000,
        "professionalTax": 200,
        "incomeTax": 5000,
        "overtimePay": 1500,
        "grossSalary": 97500,
        "netSalary": 86300,
        "ctc": 1200000,
        "totalDeductions": 11200,
        "reimbursement": 0,
        "bonus": 0,
        "payslipUrl": "https://storage.googleapis.com/bucket-name/payslips/507f1f77bcf86cd799439011-2024-12.pdf"
      },
      {
        "payslipId": "65a1b2c3d4e5f6789abcdef1",
        "employeeId": "507f1f77bcf86cd799439011",
        "employeeName": "John Doe",
        "email": "john.doe@company.com",
        "month": 11,
        "year": 2024,
        "monthYear": "2024-11",
        "basic": 50000,
        "hra": 25000,
        "da": 5000,
        "otherAllowance": 3000,
        "travelAllowance": 2000,
        "airTicketAllowance": 0,
        "medicalAllowance": 1500,
        "epfEmployee": 6000,
        "professionalTax": 200,
        "incomeTax": 5000,
        "overtimePay": 0,
        "grossSalary": 86500,
        "netSalary": 75300,
        "ctc": 1200000,
        "totalDeductions": 11200,
        "reimbursement": 0,
        "bonus": 0,
        "payslipUrl": "https://storage.googleapis.com/bucket-name/payslips/507f1f77bcf86cd799439011-2024-11.pdf"
      }
    ]
  }
}
```

### Example 2: Get Payslip for Specific Month and Year

**Request:**
```bash
GET /payslip/me?userId=507f1f77bcf86cd799439011&month=12&year=2024
```

**cURL:**
```bash
curl -X GET "https://api.example.com/payslip/me?userId=507f1f77bcf86cd799439011&month=12&year=2024"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "payslips": [
      {
        "payslipId": "65a1b2c3d4e5f6789abcdef0",
        "employeeId": "507f1f77bcf86cd799439011",
        "employeeName": "John Doe",
        "email": "john.doe@company.com",
        "month": 12,
        "year": 2024,
        "monthYear": "2024-12",
        "basic": 50000,
        "hra": 25000,
        "da": 5000,
        "otherAllowance": 3000,
        "travelAllowance": 2000,
        "airTicketAllowance": 10000,
        "medicalAllowance": 1500,
        "epfEmployee": 6000,
        "professionalTax": 200,
        "incomeTax": 5000,
        "overtimePay": 1500,
        "grossSalary": 97500,
        "netSalary": 86300,
        "ctc": 1200000,
        "totalDeductions": 11200,
        "reimbursement": 0,
        "bonus": 0,
        "payslipUrl": "https://storage.googleapis.com/bucket-name/payslips/507f1f77bcf86cd799439011-2024-12.pdf"
      }
    ]
  }
}
```

### Example 3: JavaScript/TypeScript (Fetch API)

```typescript
const getUserPayslip = async (userId: string, month?: number, year?: number) => {
  try {
    // Build query parameters
    const params = new URLSearchParams({ userId });
    if (month) params.append('month', month.toString());
    if (year) params.append('year', year.toString());

    const response = await fetch(`https://api.example.com/payslip/me?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('Payslips:', data.data.payslips);
      // Access payslip URL for downloading/viewing
      data.data.payslips.forEach(payslip => {
        console.log(`Payslip URL for ${payslip.monthYear}:`, payslip.payslipUrl);
      });
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching payslip:', error);
    throw error;
  }
};

// Usage examples:
// Get all payslips for a user
getUserPayslip('507f1f77bcf86cd799439011');

// Get payslip for December 2024
getUserPayslip('507f1f77bcf86cd799439011', 12, 2024);
```

### Example 4: React/TypeScript Component

```typescript
import React, { useState, useEffect } from 'react';

interface Payslip {
  payslipId: string;
  employeeId: string;
  employeeName: string;
  email: string;
  month: number;
  year: number;
  monthYear: string;
  basic: number;
  hra: number;
  da: number;
  otherAllowance: number;
  travelAllowance: number;
  airTicketAllowance: number;
  medicalAllowance: number;
  epfEmployee: number;
  professionalTax: number;
  incomeTax: number;
  overtimePay: number;
  grossSalary: number;
  netSalary: number;
  ctc: number;
  totalDeductions: number;
  reimbursement: number;
  bonus: number;
  payslipUrl: string;
}

interface PayslipResponse {
  success: boolean;
  data: {
    payslips: Payslip[];
  };
}

const PayslipViewer: React.FC<{ userId: string }> = ({ userId }) => {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayslips = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `https://api.example.com/payslip/me?userId=${userId}`
        );
        
        if (!response.ok) {
          throw new Error('Failed to fetch payslips');
        }
        
        const data: PayslipResponse = await response.json();
        
        if (data.success) {
          setPayslips(data.data.payslips);
        } else {
          throw new Error('API returned unsuccessful response');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchPayslips();
  }, [userId]);

  if (loading) return <div>Loading payslips...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="payslip-list">
      <h2>My Payslips</h2>
      {payslips.map((payslip) => (
        <div key={payslip.payslipId} className="payslip-card">
          <h3>{payslip.monthYear}</h3>
          <p>Gross Salary: ₹{payslip.grossSalary.toLocaleString()}</p>
          <p>Net Salary: ₹{payslip.netSalary.toLocaleString()}</p>
          <p>Total Deductions: ₹{payslip.totalDeductions.toLocaleString()}</p>
          <a 
            href={payslip.payslipUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="download-link"
          >
            Download Payslip PDF
          </a>
        </div>
      ))}
    </div>
  );
};

export default PayslipViewer;
```

---

## Business Logic

### Filter Criteria
The endpoint retrieves payslips based on the following criteria:
- `isExport: true` - Only exported/finalized payslips
- `status: ["Sent", "Exported"]` - Only payslips that have been sent or exported
- Results are sorted by year and month in descending order (most recent first)

### Data Population
The response includes populated data from related collections:
- **User Data**: `name`, `email` from the User collection
- **Payroll Data**: Complete salary breakdown from the Payroll collection

### Calculation Fields
- **Gross Salary**: Sum of all allowances (basic + hra + da + other allowances)
- **Total Deductions**: Sum of EPF, professional tax, and income tax
- **Net Salary**: Gross Salary - Total Deductions + Overtime + Reimbursements + Bonus

---

## Error Handling

### Common Errors

| Status Code | Error Message | Cause | Solution |
|-------------|---------------|-------|----------|
| 400 | Bad Request | Invalid query parameters | Ensure `userId` is a valid MongoDB ObjectId, `month` is 1-12, `year` is a valid year |
| 400 | User not found | userId doesn't exist in database | Verify the userId is correct |
| 400 | No payslips found | No payslips match the criteria | Check if payslips have been generated for the specified period |
| 500 | Internal Server Error | Server-side error | Contact system administrator |

### Error Response Examples

**Invalid userId:**
```json
{
  "success": false,
  "error": {
    "message": "Cast to ObjectId failed for value \"invalid-id\" at path \"userId\""
  }
}
```

**No payslips found:**
```json
{
  "success": false,
  "error": {
    "message": "No payslips found for the specified criteria"
  }
}
```

---

## Notes

### Important Considerations

1. **Authentication**: Currently, the route does not require authentication. In production, this should be secured with proper authentication middleware to prevent unauthorized access.

2. **Payslip URL**: The `payslipUrl` field contains a direct link to the PDF stored in Google Cloud Storage. This URL may have an expiration time depending on your GCS configuration.

3. **Status Filter**: Only payslips with status "Sent" or "Exported" are returned. Draft or pending payslips are not included.

4. **Data Consistency**: The endpoint combines data from Payslip and Payroll collections. Ensure both records exist for complete data.

5. **Sorting**: Results are always sorted by year and month in descending order (newest first).

### Security Recommendations

1. **Add Authentication**: Implement JWT or session-based authentication
2. **Authorization**: Ensure users can only access their own payslips
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **HTTPS Only**: Always use HTTPS in production
5. **Signed URLs**: Use signed URLs for GCS with limited expiration time

### Performance Considerations

1. **Pagination**: For users with many payslips, consider implementing pagination
2. **Caching**: Consider caching payslip data that doesn't change frequently
3. **Indexing**: Ensure proper database indexes on `userId`, `month`, `year`, and `status` fields

---

## Related Endpoints

- `POST /payslip/bulk-generate` - Generate payslips in bulk
- `POST /payslip/send` - Send payslips via email
- `POST /payslip/by-users` - Get payslips for multiple users
- `GET /payslip/is-generated` - Check if payslips are generated

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Current | Initial documentation |

---

## Contact & Support

For issues or questions regarding this API endpoint, contact the development team or refer to the main API documentation.

