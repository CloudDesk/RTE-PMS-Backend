# Dynamic Cleanup Endpoint Usage Guide

## Overview

The cleanup endpoint now supports dynamic collection selection, allowing you to delete records from different collections without hardcoding the collection name.

## Endpoint

```
DELETE /api/bulk-attendance-upload/cleanup
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confirm` | string | Yes | Must be "true" to confirm deletion |
| `collection` | string | No | Collection name to clean up (default: attendance-records) |
| `userId` | string | No | Delete only records for specific user |
| `shiftCode` | string | No | Delete only records for specific shift |
| `dateFrom` | string | No | Delete records from this date (YYYY-MM-DD) |
| `dateTo` | string | No | Delete records up to this date (YYYY-MM-DD) |

## Supported Collections

| Collection | Model | Date Field | Description |
|------------|-------|------------|-------------|
| `attendancerecords` | AttendanceRecord | shiftDay | Attendance records |
| `shiftassignments` | ShiftAssignment | startDate | Shift assignments |
| `leaves` | Leave | createdAt | Leave records |
| `attendanceregularizations` | AttendanceRegularization | createdAt | Attendance regularization records |

## Usage Examples

### 1. Clean up all attendance records
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true
```

### 2. Clean up shift assignments
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true&collection=shiftassignments
```

### 3. Clean up leaves created after a specific date
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true&collection=leaves&dateFrom=2025-01-01
```

### 4. Clean up attendance records for a specific user
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true&collection=attendancerecords&userId=507f1f77bcf86cd799439011
```

### 5. Clean up shift assignments for a specific shift code
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true&collection=shiftassignments&shiftCode=MORNING
```

### 6. Clean up attendance regularizations within a date range
```bash
DELETE /api/bulk-attendance-upload/cleanup?confirm=true&collection=attendanceregularizations&dateFrom=2025-01-01&dateTo=2025-01-31
```

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "data": {
    "deletedCount": 150,
    "totalRecordsBefore": 1000,
    "totalRecordsAfter": 850,
    "collection": "attendancerecords"
  },
  "message": "Successfully deleted 150 attendancerecords records. Total records: 1000 → 850"
}
```

### Error Response (400)
```json
{
  "success": false,
  "error": {
    "message": "Confirmation required. Add ?confirm=true to the URL to proceed with deletion."
  }
}
```

### Invalid Collection Error (400)
```json
{
  "success": false,
  "error": {
    "message": "Invalid collection: invalid-collection. Supported collections: attendancerecords, leaves, shiftassignments, attendanceregularizations"
  }
}
```

## Security Considerations

⚠️ **WARNING**: This endpoint is for development/testing purposes only!

- Always requires `confirm=true` parameter
- Should be disabled in production environments
- Consider adding additional authentication/authorization
- Use with extreme caution as deletions are permanent

## Implementation Details

### Dynamic Model Selection
The endpoint dynamically selects the appropriate Mongoose model based on the collection parameter:

```typescript
switch (collection) {
  case 'attendancerecords':
    Model = AttendanceRecord;
    dateField = 'shiftDay';
    break;
  case 'shiftassignments':
    Model = ShiftAssignment;
    dateField = 'startDate';
    break;
  case 'leaves':
    Model = Leave;
    dateField = 'createdAt';
    break;
  case 'attendanceregularizations':
    Model = AttendanceRegularization;
    dateField = 'createdAt';
    break;
}
```

### Dynamic Date Field Mapping
Each collection uses different date fields for filtering:
- `attendancerecords`: `shiftDay`
- `shiftassignments`: `startDate`
- `leaves`: `createdAt`
- `attendanceregularizations`: `createdAt`

### Query Building
The endpoint builds MongoDB queries dynamically based on provided parameters:
- `userId`: Filters by user ID (ObjectId)
- `shiftCode`: Filters by shift code (string)
- `dateFrom`/`dateTo`: Filters by date range using the appropriate date field

## Testing

### Test with cURL
```bash
# Test attendance records cleanup
curl -X DELETE "http://localhost:3000/api/bulk-attendance-upload/cleanup?confirm=true&collection=attendancerecords"

# Test shift assignments cleanup
curl -X DELETE "http://localhost:3000/api/bulk-attendance-upload/cleanup?confirm=true&collection=shiftassignments"

# Test leaves cleanup
curl -X DELETE "http://localhost:3000/api/bulk-attendance-upload/cleanup?confirm=true&collection=leaves"

# Test attendance regularizations cleanup
curl -X DELETE "http://localhost:3000/api/bulk-attendance-upload/cleanup?confirm=true&collection=attendanceregularizations"

# Test with date range
curl -X DELETE "http://localhost:3000/api/bulk-attendance-upload/cleanup?confirm=true&collection=attendancerecords&dateFrom=2025-01-01&dateTo=2025-01-31"
```

### Test with Postman
1. Set method to `DELETE`
2. Set URL to your endpoint with query parameters
3. Send request and verify response

## Best Practices

1. **Always test on development environment first**
2. **Use specific filters** (userId, dateRange) to limit deletion scope
3. **Verify the collection parameter** before executing
4. **Monitor the response** to confirm deletion counts
5. **Backup data** before running cleanup operations
6. **Use date ranges** to avoid accidental bulk deletions

## Troubleshooting

### Common Issues

1. **"Confirmation required" Error**
   - Add `?confirm=true` to the URL

2. **"Invalid collection" Error**
   - Check the collection name spelling
   - Use one of the supported collections

3. **No records deleted**
   - Check if the query filters are too restrictive
   - Verify the collection has data
   - Check date format (YYYY-MM-DD)

4. **Permission denied**
   - Ensure you have proper authentication
   - Check if the endpoint is enabled in your environment 