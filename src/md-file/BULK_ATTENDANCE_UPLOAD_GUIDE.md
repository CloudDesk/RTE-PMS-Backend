# Bulk Attendance Upload Guide

## Overview

The Bulk Attendance Upload feature allows managers to upload monthly attendance data for external users (contractors/vendors) using a single Excel file. This feature automatically creates shift assignments and attendance records, handling weekend configurations and validation.

## Excel Structure

### Enhanced Multi-Sheet Design

We use an **enhanced Excel template** with multiple sheets for optimal user experience and data integrity. This approach:
- Provides data validation and reference sheets
- Reduces data entry errors with dropdowns and validation
- Includes comprehensive instructions and examples
- Ensures shift and attendance data are always in sync

### Template Structure

The Excel template contains **4 sheets**:

1. **"Bulk Attendance Upload"** - Main data entry sheet
2. **"Users Reference"** - List of available external users
3. **"Shifts Reference"** - List of available active shifts
4. **"Instructions"** - Comprehensive usage guide

### Column Structure

| Column | Field | Required | Format | Description |
|--------|-------|----------|--------|-------------|
| A | User ID | Yes | MongoDB ObjectId | Valid user ID with role 'external' |
| B | User Name | No | Text | Display name (for reference) |
| C | Shift Code | Yes | Text | Active shift code (e.g., 'MORNING', 'NIGHT') |
| D | Shift Name | No | Text | Shift display name (for reference) |
| E | Start Date | Yes | YYYY-MM-DD | Shift assignment start date |
| F | End Date | No | YYYY-MM-DD | Shift assignment end date (optional) |
| G | Weekend Days | Yes | 0,1,2,3,4,5,6 | Comma-separated weekend days |
| H | Attendance Date | Yes | YYYY-MM-DD | Date of attendance record |
| I | In Time | Yes | HH:mm | Check-in time (24-hour format) |
| J | Out Time | Yes | HH:mm | Check-out time (24-hour format) |
| K | Device ID | No | Text | Device identifier |
| L | Location | No | Text | Location description |

### Weekend Days Format

- **0** = Sunday
- **1** = Monday
- **2** = Tuesday
- **3** = Wednesday
- **4** = Thursday
- **5** = Friday
- **6** = Saturday

**Examples:**
- UAE: `5,6` (Friday-Saturday)
- India: `0,6` (Sunday-Saturday)
- US: `0,6` (Sunday-Saturday)

### Data Validation Features

The template includes several validation features to prevent errors:

1. **User ID Validation**: Dropdown with available external users
2. **Shift Code Validation**: Dropdown with active shifts
3. **Weekend Days Validation**: Predefined common configurations
4. **Date Format Validation**: Ensures YYYY-MM-DD format
5. **Time Format Validation**: Ensures HH:mm format (24-hour)
6. **Cell Notes**: Helpful tips and format examples

### Reference Sheets

#### Users Reference Sheet
Contains all external users with their IDs, names, and emails for easy copy-paste.

#### Shifts Reference Sheet
Contains all active shifts with codes, names, and timing information.

#### Instructions Sheet
Comprehensive step-by-step guide with:
- Usage instructions
- Column guidelines
- Validation rules
- Common weekend configurations
- Tips and best practices

## API Endpoints

### 1. Download Template

**GET** `/bulk-upload/template`

Downloads an enhanced Excel template with:
- **4 sheets**: Main data entry, Users reference, Shifts reference, Instructions
- **Data validation**: Dropdowns and format validation
- **Reference data**: Current external users and active shifts
- **Cell notes**: Format examples and helpful tips
- **Sample data**: Pre-filled with actual user and shift data
- **Comprehensive instructions**: Step-by-step usage guide

### 2. Parse and Validate

**POST** `/bulk-upload/parse`

**Content-Type:** `multipart/form-data`

**Body:** Excel file (.xlsx)

**Response:**
```json
{
  "success": true,
  "data": {
    "validRows": [...],
    "invalidRows": [...],
    "errors": [
      {
        "rowNumber": 3,
        "field": "userId",
        "message": "User not found or not an external user",
        "severity": "error"
      },
      {
        "rowNumber": 5,
        "field": "attendanceDate",
        "message": "Attendance on weekend - please confirm",
        "severity": "warning"
      }
    ],
    "summary": {
      "totalRows": 100,
      "validRows": 85,
      "invalidRows": 15,
      "errors": 10,
      "warnings": 5,
      "weekendAttendanceCount": 3
    }
  },
  "message": "Parsed 100 rows. Found 85 valid rows and 15 invalid rows."
}
```

### 3. Confirm and Process

**POST** `/bulk-upload/confirm`

**Body:**
```json
{
  "validRows": [
    {
      "rowNumber": 2,
      "userId": "507f1f77bcf86cd799439011",
      "userName": "John Doe",
      "shiftCode": "MORNING",
      "startDate": "2025-01-01",
      "endDate": "2025-12-31",
      "weekendDays": "5,6",
      "attendanceDate": "2025-01-02",
      "inTime": "09:00",
      "outTime": "17:00",
      "deviceId": "DEVICE001",
      "location": "Office Building A"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shiftAssignmentsCreated": 5,
    "attendanceRecordsCreated": 85,
    "errors": []
  },
  "message": "Bulk upload completed successfully"
}
```

### 4. Get Statistics

**GET** `/bulk-upload/stats`

Returns upload statistics and success rates.

## Validation Rules

### User Validation
- User ID must be a valid MongoDB ObjectId
- User must exist in the system
- User must have role 'external'

### Shift Validation
- Shift code must exist and be active
- Shift must be applicable for the user's role

### Date Validation
- Start date must be in YYYY-MM-DD format
- End date must be after start date (if provided)
- Attendance date must be within shift assignment period
- Attendance date must be after shift start date

### Time Validation
- In/Out times must be in HH:mm format (24-hour)
- Out time must be after in time
- Handles overnight shifts automatically

### Weekend Validation
- Weekend days must be comma-separated numbers 0-6
- Attendance on weekends is flagged as warning (not error)
- Managers can choose to proceed or reject weekend attendance

### Business Logic Validation
- Attendance date must be within shift assignment period
- Validates shift window compliance
- Calculates work hours and overtime

## Error Handling

### Error Types

1. **Errors (Severity: error)**
   - Invalid user ID
   - Invalid shift code
   - Invalid date/time formats
   - Business rule violations
   - These prevent processing

2. **Warnings (Severity: warning)**
   - Weekend attendance
   - Late entry/early exit
   - Out-of-window swipes
   - These allow processing with confirmation

### Error Response Format

```json
{
  "rowNumber": 3,
  "field": "userId",
  "message": "User not found or not an external user",
  "severity": "error"
}
```

## Processing Logic

### Shift Assignment Creation

1. **Check for existing assignments**
   - Look for overlapping shift assignments
   - Update existing if dates/weekends changed
   - Create new if no overlap

2. **Handle weekend configurations**
   - Parse weekend days from Excel
   - Apply country-specific defaults
   - Validate weekend day format

### Attendance Record Creation

1. **Calculate shift times**
   - Apply shift start/end times to attendance date
   - Handle overnight shifts
   - Calculate shift window compliance

2. **Create swipe records**
   - Generate IN/OUT swipes from times
   - Set device ID and location
   - Handle overnight attendance

3. **Calculate work metrics**
   - Total work hours
   - Break hours (default: 0)
   - Actual work hours
   - Shortfall/excess hours

4. **Determine attendance status**
   - Present/Late/On-Time
   - Early-Exit
   - Holiday-Swipe (weekend)
   - Out-Of-Window

## Best Practices

### Excel Preparation

1. **Use the enhanced template**
   - Download the latest template for current data
   - Template includes real user and shift data
   - Follow the step-by-step instructions

2. **Leverage reference sheets**
   - Copy User IDs from "Users Reference" sheet
   - Copy Shift Codes from "Shifts Reference" sheet
   - Use predefined weekend configurations

3. **Utilize data validation**
   - Use dropdown lists where available
   - Follow format examples in cell notes
   - Check the Instructions sheet for guidance

4. **Data validation**
   - Verify user IDs exist in reference sheet
   - Confirm shift codes are active
   - Check date formats (YYYY-MM-DD)
   - Validate time formats (HH:mm)

5. **Weekend handling**
   - Use correct weekend day numbers
   - Choose from predefined configurations
   - Flag weekend attendance for review
   - Consider country-specific configurations

### Performance Considerations

1. **Batch processing**
   - Process up to 10,000 rows efficiently
   - Use bulk database operations
   - Minimize database queries

2. **Memory management**
   - Stream large files
   - Process in chunks if needed
   - Clean up temporary data

### Error Resolution

1. **Fix validation errors first**
   - Address all 'error' severity issues
   - Re-upload corrected file

2. **Review warnings**
   - Confirm weekend attendance
   - Verify late/early entries
   - Check out-of-window swipes

3. **Monitor processing results**
   - Check shift assignments created
   - Verify attendance records
   - Review any processing errors

## Example Usage

### Step 1: Download Template
```bash
curl -X GET "https://api.example.com/bulk-upload/template" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o bulk_attendance_template.xlsx
```

### Step 2: Prepare Excel File
1. **Open the downloaded template**
   - Review all 4 sheets: Main, Users Reference, Shifts Reference, Instructions
   - Read the Instructions sheet for complete guidance

2. **Use reference sheets**
   - Go to "Users Reference" sheet to see available external users
   - Go to "Shifts Reference" sheet to see available shifts
   - Copy User IDs and Shift Codes as needed

3. **Fill the main sheet**
   - Use dropdowns or copy-paste from reference sheets
   - Follow format examples in cell notes
   - Ensure all required fields are filled

4. **Validate data**
   - Check date formats (YYYY-MM-DD)
   - Check time formats (HH:mm)
   - Verify weekend configurations
   - Review Instructions sheet for validation rules

### Step 3: Upload and Validate
```bash
curl -X POST "https://api.example.com/bulk-upload/parse" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@bulk_attendance_data.xlsx"
```

### Step 4: Review Results
- Check validation summary
- Fix any errors
- Review warnings
- Decide on weekend attendance

### Step 5: Confirm Upload
```bash
curl -X POST "https://api.example.com/bulk-upload/confirm" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"validRows": [...]}'
```

## Troubleshooting

### Common Issues

1. **"User not found"**
   - Download the latest template for current user data
   - Check "Users Reference" sheet for available users
   - Ensure user has role 'external' and is active
   - Copy User ID exactly from reference sheet

2. **"Shift not found"**
   - Check "Shifts Reference" sheet for available shifts
   - Ensure shift is active
   - Copy Shift Code exactly from reference sheet
   - Verify shift is applicable for user role

3. **"Invalid date format"**
   - Use YYYY-MM-DD format (e.g., 2025-01-15)
   - Check cell notes for format examples
   - Avoid Excel date formatting issues
   - Export as text if needed

4. **"Invalid time format"**
   - Use HH:mm format (24-hour, e.g., 09:30, 17:45)
   - Check cell notes for format examples
   - Avoid AM/PM notation
   - Use leading zeros for single digits

5. **"Weekend attendance"**
   - Review weekend day configuration
   - Use predefined configurations from dropdown
   - Confirm attendance is intentional
   - Consider country-specific rules

6. **"Template data outdated"**
   - Download fresh template for current data
   - Template includes real-time user and shift data
   - Check Instructions sheet for latest guidelines

### Performance Issues

1. **Large file processing**
   - Split into smaller files
   - Process in batches
   - Monitor server resources

2. **Memory usage**
   - Close Excel files after upload
   - Clear browser cache
   - Restart application if needed

## Enhanced Template Features

### Multi-Sheet Structure

The enhanced template provides a comprehensive solution with 4 interconnected sheets:

#### 1. Bulk Attendance Upload (Main Sheet)
- **Purpose**: Primary data entry sheet
- **Features**: 
  - Data validation with cell notes
  - Sample data with real user/shift information
  - Format validation for dates and times
  - Column formatting and auto-sizing

#### 2. Users Reference Sheet
- **Purpose**: Reference for available external users
- **Columns**: User ID, User Name, Email, Role
- **Features**:
  - Real-time data from database
  - Easy copy-paste functionality
  - Filtered to external users only
  - Active users only

#### 3. Shifts Reference Sheet
- **Purpose**: Reference for available active shifts
- **Columns**: Shift Code, Shift Name, Start Time, End Time, Status
- **Features**:
  - Real-time data from database
  - Easy copy-paste functionality
  - Active shifts only
  - Complete shift information

#### 4. Instructions Sheet
- **Purpose**: Comprehensive usage guide
- **Content**:
  - Step-by-step instructions
  - Column guidelines and requirements
  - Weekend day number reference
  - Common weekend configurations
  - Validation rules and tips
  - Troubleshooting guide

### Data Validation Features

#### Cell Notes and Tips
- **User ID**: Available options listed in cell notes
- **Shift Code**: Available options listed in cell notes
- **Dates**: Format examples (YYYY-MM-DD)
- **Times**: Format examples (HH:mm)
- **Weekend Days**: Predefined configurations

#### Format Validation
- **Date Columns**: Automatic date formatting
- **Time Columns**: Automatic time formatting
- **Reference Data**: Real-time from database
- **Sample Data**: Uses actual user and shift data

### Template Benefits

1. **Error Prevention**
   - Data validation reduces input errors
   - Reference sheets ensure accurate data
   - Format validation prevents common mistakes

2. **User Experience**
   - Single file contains everything needed
   - Clear instructions and examples
   - Easy copy-paste functionality

3. **Data Integrity**
   - Real-time reference data
   - Consistent formatting
   - Validation at multiple levels

4. **Maintenance**
   - Template updates automatically with data changes
   - No need for separate reference files
   - Centralized instructions and guidelines

## Security Considerations

1. **Authentication required**
   - All endpoints require valid JWT token
   - User must have appropriate permissions

2. **File validation**
   - Only .xlsx files accepted
   - File size limits enforced
   - Malware scanning recommended

3. **Data validation**
   - All input validated server-side
   - SQL injection prevention
   - XSS protection

4. **Audit trail**
   - All uploads logged
   - User actions tracked
   - Error logs maintained

5. **Template security**
   - Reference data filtered by user permissions
   - Only active and authorized data included
   - No sensitive information in template 