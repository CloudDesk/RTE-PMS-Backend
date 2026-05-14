# Backend Changes for Frontend Implementation
## Multiple Swipes Feature - API Documentation

**Version:** 2.0.0  
**Date:** 2024  
**Feature:** Multiple Swipes Support  
**Status:** ✅ Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Breaking Changes](#breaking-changes)
3. [API Endpoint Changes](#api-endpoint-changes)
4. [Response Structure Changes](#response-structure-changes)
5. [New Fields Added](#new-fields-added)
6. [TypeScript Interfaces](#typescript-interfaces)
7. [Migration Guide](#migration-guide)
8. [Code Examples](#code-examples)
9. [Frontend Implementation Checklist](#frontend-implementation-checklist)

---

## Overview

### What Changed?

The backend now supports **multiple IN/OUT swipes** per day instead of just 2 swipes. This enables:
- ✅ Multiple work sessions (e.g., morning shift + afternoon shift)
- ✅ Break tracking (automatic detection of breaks between swipes)
- ✅ Accurate work hour calculations for complex swipe patterns
- ✅ Support for employees who leave and return multiple times

### What Stayed the Same?

- ✅ All API endpoints remain the same
- ✅ Request structure unchanged
- ✅ Authentication unchanged
- ✅ Error handling unchanged
- ✅ Backward compatible (2-swipe days still work)

---

## Breaking Changes

### ⚠️ None - Fully Backward Compatible

The implementation is **100% backward compatible**. Existing frontend code will continue to work. However, you may want to update your UI to display the new multiple swipe features.

---

## API Endpoint Changes

### 1. Process Swipe Endpoint

**Endpoint:** `POST /biometric-attendance/swipe`

**Status:** ✅ **No Changes** - Same endpoint, enhanced response

**Request:** (Unchanged)
```typescript
{
  biometricId: string;
  timestamp?: string; // ISO date-time, optional
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number;
    address: string;
  };
  hasLocation?: boolean;
  locationValid?: boolean;
  locationAddress?: string;
}
```

**Response:** (Enhanced with new fields)
```typescript
{
  success: boolean;
  message: string;
  data?: {
    // ... existing fields ...
    
    // NEW FIELDS (optional - only present when applicable)
    swipeDirection?: 'IN' | 'OUT';        // NEW
    totalSwipes?: number;                 // NEW
    workSessions?: WorkSession[];          // NEW
    breakPeriods?: BreakPeriod[];         // NEW
  };
}
```

---

## Response Structure Changes

### Enhanced Swipe Response

The `/swipe` endpoint now returns additional fields when there are 2+ swipes:

#### New Fields in Response

| Field | Type | Description | When Present |
|-------|------|-------------|--------------|
| `swipeDirection` | `'IN' \| 'OUT'` | Direction of the current swipe | Always |
| `totalSwipes` | `number` | Total number of swipes for the day | Always |
| `workSessions` | `WorkSession[]` | Array of work sessions (IN-OUT pairs) | When `totalSwipes >= 2` |
| `breakPeriods` | `BreakPeriod[]` | Array of break periods (OUT-IN gaps) | When `totalSwipes >= 2` |

#### Work Session Structure

```typescript
interface WorkSession {
  sessionNumber: number;      // 1, 2, 3, etc.
  inTime: Date;                // UTC timestamp
  outTime: Date;                // UTC timestamp
  durationMinutes: number;      // Duration in minutes
  isOvertime: boolean;         // true if extends beyond shift end
}
```

#### Break Period Structure

```typescript
interface BreakPeriod {
  breakNumber: number;          // 1, 2, 3, etc.
  startTime: Date;              // UTC timestamp (OUT time)
  endTime: Date;                // UTC timestamp (IN time)
  durationMinutes: number;      // Duration in minutes
  isLunchBreak: boolean;        // true if >= 30 minutes
}
```

**Note:** Breaks < 15 minutes are **not included** in `breakPeriods` (considered too short to count).

---

## New Fields Added

### 1. Swipe Response Fields

#### `swipeDirection`
- **Type:** `'IN' | 'OUT'`
- **Description:** Direction of the current swipe
- **Example:** `"IN"` or `"OUT"`
- **Always Present:** Yes

#### `totalSwipes`
- **Type:** `number`
- **Description:** Total number of swipes recorded for the day
- **Example:** `4` (for 4 swipes: IN, OUT, IN, OUT)
- **Always Present:** Yes

#### `workSessions`
- **Type:** `WorkSession[]`
- **Description:** Array of work sessions (IN-OUT pairs)
- **Example:** See Work Session Structure above
- **Present When:** `totalSwipes >= 2`
- **Empty Array:** If no complete sessions (e.g., only IN swipes)

#### `breakPeriods`
- **Type:** `BreakPeriod[]`
- **Description:** Array of break periods (gaps between OUT and next IN)
- **Example:** See Break Period Structure above
- **Present When:** `totalSwipes >= 2` and breaks exist
- **Empty Array:** If no breaks >= 15 minutes

### 2. Attendance Record Fields

When fetching attendance records (via `/records`, `/status`, etc.), the `swipes` array now contains all swipes:

```typescript
{
  swipes: [
    {
      timestamp: Date;          // UTC timestamp
      direction: 'IN' | 'OUT';   // Swipe direction
      deviceId: string;          // Device identifier
      location?: {               // GPS location (optional)
        latitude: number;
        longitude: number;
        accuracy: number;
        altitude: number;
        address: string;
      };
    },
    // ... more swipes ...
  ]
}
```

**Important:** Swipes are **always sorted by timestamp** (oldest first).

---

## TypeScript Interfaces

### Complete Response Interface

```typescript
interface ISwipeResponse {
  success: boolean;
  message: string;
  data?: {
    // Existing fields
    userId: string;
    shiftCode: string;
    shiftDay: Date;
    swipeTime: Date;
    firstIn?: Date | null;
    lastOut?: Date | null;
    isWithinWindow: boolean;
    needsRegularization?: boolean;
    isLateEntry?: boolean;
    isEarlyExit?: boolean;
    status: string;
    attendanceStatus: string[];
    totalWorkHours?: string;
    breakHours?: string;
    actualWorkHours?: string;
    shiftHours?: string;
    shortfallHours?: string;
    excessHours?: string;
    
    // NEW FIELDS
    swipeDirection?: 'IN' | 'OUT';
    totalSwipes?: number;
    workSessions?: WorkSession[];
    breakPeriods?: BreakPeriod[];
    outOfWindowSwipes?: OutOfWindowSwipe[];
    reason?: string;
  };
}

interface WorkSession {
  sessionNumber: number;
  inTime: Date;
  outTime: Date;
  durationMinutes: number;
  isOvertime: boolean;
}

interface BreakPeriod {
  breakNumber: number;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  isLunchBreak: boolean;
}

interface OutOfWindowSwipe {
  timestamp: Date;
  direction: 'IN' | 'OUT';
  deviceId: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number;
    address: string;
  };
  reason: string;
}
```

### Attendance Record Interface

```typescript
interface AttendanceRecord {
  _id: string;
  userId: string;
  shiftCode: string;
  shiftDay: Date;
  shiftStart: Date;
  shiftEnd: Date;
  
  // Swipes array (now supports multiple swipes)
  swipes: Swipe[];
  
  firstIn: Date | null;
  lastOut: Date | null;
  
  status: 'incomplete' | 'complete' | 'duplicate_swipes' | 'missing_checkout' | 'holiday_swipe' | 'leave_swipe' | 'pending_regularization' | 'regularized' | 'overridden';
  attendanceStatus: string[]; // Array of statuses: ['Late', 'Present', 'OT']
  
  // Time calculations
  totalWorkHours: string;      // Format: "HH:mm:ss"
  breakHours: string;          // Format: "HH:mm:ss"
  actualWorkHours: string;     // Format: "HH:mm:ss"
  shiftHours: string;          // Format: "HH:mm:ss"
  shortfallHours: string;      // Format: "HH:mm:ss"
  excessHours: string;         // Format: "HH:mm:ss"
  
  // Flags
  isWithinWindow: boolean;
  isLateEntry: boolean;
  isEarlyExit: boolean;
  needsRegularization: boolean;
  
  outOfWindowSwipes: OutOfWindowSwipe[];
}

interface Swipe {
  timestamp: Date;
  direction: 'IN' | 'OUT';
  deviceId: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number;
    address: string;
  };
}
```

---

## Migration Guide

### Step 1: Update TypeScript Interfaces

Add the new interfaces to your frontend codebase:

```typescript
// types/attendance.ts

export interface WorkSession {
  sessionNumber: number;
  inTime: string;  // ISO date string
  outTime: string; // ISO date string
  durationMinutes: number;
  isOvertime: boolean;
}

export interface BreakPeriod {
  breakNumber: number;
  startTime: string;  // ISO date string
  endTime: string;    // ISO date string
  durationMinutes: number;
  isLunchBreak: boolean;
}

export interface SwipeResponse {
  success: boolean;
  message: string;
  data?: {
    // ... existing fields ...
    swipeDirection?: 'IN' | 'OUT';
    totalSwipes?: number;
    workSessions?: WorkSession[];
    breakPeriods?: BreakPeriod[];
  };
}
```

### Step 2: Update Swipe Display Component

**Before (2 swipes only):**
```typescript
// Old code - only shows first and last swipe
const SwipeDisplay = ({ record }) => {
  return (
    <div>
      <p>Check-in: {formatTime(record.firstIn)}</p>
      <p>Check-out: {formatTime(record.lastOut)}</p>
    </div>
  );
};
```

**After (multiple swipes):**
```typescript
// New code - shows all swipes
const SwipeDisplay = ({ record }) => {
  return (
    <div>
      <h3>Swipes ({record.swipes?.length || 0})</h3>
      {record.swipes?.map((swipe, index) => (
        <div key={index}>
          <span>{swipe.direction}</span>
          <span>{formatTime(swipe.timestamp)}</span>
        </div>
      ))}
      
      {/* Show work sessions if available */}
      {record.workSessions && record.workSessions.length > 0 && (
        <div>
          <h4>Work Sessions</h4>
          {record.workSessions.map(session => (
            <div key={session.sessionNumber}>
              <p>Session {session.sessionNumber}: {formatTime(session.inTime)} - {formatTime(session.outTime)}</p>
              <p>Duration: {formatDuration(session.durationMinutes)}</p>
              {session.isOvertime && <span>Overtime</span>}
            </div>
          ))}
        </div>
      )}
      
      {/* Show breaks if available */}
      {record.breakPeriods && record.breakPeriods.length > 0 && (
        <div>
          <h4>Breaks</h4>
          {record.breakPeriods.map(breakPeriod => (
            <div key={breakPeriod.breakNumber}>
              <p>Break {breakPeriod.breakNumber}: {formatTime(breakPeriod.startTime)} - {formatTime(breakPeriod.endTime)}</p>
              <p>Duration: {formatDuration(breakPeriod.durationMinutes)}</p>
              {breakPeriod.isLunchBreak && <span>Lunch Break</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

### Step 3: Handle Optional Fields

Always check if new fields exist before using them:

```typescript
// Safe access pattern
const handleSwipeResponse = (response: SwipeResponse) => {
  if (response.data) {
    // Existing fields (always present)
    console.log('Status:', response.data.status);
    console.log('Total Work Hours:', response.data.totalWorkHours);
    
    // New fields (optional - check before use)
    if (response.data.swipeDirection) {
      console.log('Swipe Direction:', response.data.swipeDirection);
    }
    
    if (response.data.totalSwipes) {
      console.log('Total Swipes:', response.data.totalSwipes);
    }
    
    if (response.data.workSessions && response.data.workSessions.length > 0) {
      console.log('Work Sessions:', response.data.workSessions);
    }
    
    if (response.data.breakPeriods && response.data.breakPeriods.length > 0) {
      console.log('Break Periods:', response.data.breakPeriods);
    }
  }
};
```

---

## Code Examples

### Example 1: Process Swipe (Unchanged Request)

```typescript
// Request - NO CHANGES
const processSwipe = async (biometricId: string, location?: LocationData) => {
  const response = await fetch('/biometric-attendance/swipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      biometricId,
      timestamp: new Date().toISOString(),
      location,
    }),
  });
  
  const result: SwipeResponse = await response.json();
  
  // Handle response (now includes new fields)
  if (result.success && result.data) {
    console.log('Swipe processed:', result.data.swipeDirection);
    console.log('Total swipes today:', result.data.totalSwipes);
    
    // Display work sessions if available
    if (result.data.workSessions) {
      result.data.workSessions.forEach(session => {
        console.log(`Session ${session.sessionNumber}: ${session.durationMinutes} minutes`);
      });
    }
    
    // Display breaks if available
    if (result.data.breakPeriods) {
      result.data.breakPeriods.forEach(breakPeriod => {
        console.log(`Break ${breakPeriod.breakNumber}: ${breakPeriod.durationMinutes} minutes`);
        if (breakPeriod.isLunchBreak) {
          console.log('  (Lunch Break)');
        }
      });
    }
  }
  
  return result;
};
```

### Example 2: Display Multiple Swipes

```typescript
// React component example
const AttendanceCard = ({ record }: { record: AttendanceRecord }) => {
  return (
    <div className="attendance-card">
      <h3>{formatDate(record.shiftDay)}</h3>
      
      {/* Status */}
      <div className="status">
        <span className={`badge ${record.status}`}>{record.status}</span>
        {record.attendanceStatus.map(status => (
          <span key={status} className="badge">{status}</span>
        ))}
      </div>
      
      {/* All Swipes */}
      <div className="swipes">
        <h4>Swipes ({record.swipes?.length || 0})</h4>
        <div className="swipe-list">
          {record.swipes?.map((swipe, index) => (
            <div key={index} className="swipe-item">
              <span className={`direction ${swipe.direction.toLowerCase()}`}>
                {swipe.direction}
              </span>
              <span className="time">{formatTime(swipe.timestamp)}</span>
              {swipe.location?.address && (
                <span className="location">{swipe.location.address}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Work Sessions (if available) */}
      {record.workSessions && record.workSessions.length > 0 && (
        <div className="work-sessions">
          <h4>Work Sessions</h4>
          {record.workSessions.map(session => (
            <div key={session.sessionNumber} className="session">
              <div className="session-header">
                <span>Session {session.sessionNumber}</span>
                {session.isOvertime && <span className="overtime-badge">OT</span>}
              </div>
              <div className="session-times">
                <span>IN: {formatTime(session.inTime)}</span>
                <span>OUT: {formatTime(session.outTime)}</span>
              </div>
              <div className="session-duration">
                Duration: {formatDuration(session.durationMinutes)}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Break Periods (if available) */}
      {record.breakPeriods && record.breakPeriods.length > 0 && (
        <div className="breaks">
          <h4>Breaks</h4>
          {record.breakPeriods.map(breakPeriod => (
            <div key={breakPeriod.breakNumber} className="break">
              <div className="break-header">
                <span>Break {breakPeriod.breakNumber}</span>
                {breakPeriod.isLunchBreak && (
                  <span className="lunch-badge">Lunch</span>
                )}
              </div>
              <div className="break-times">
                <span>{formatTime(breakPeriod.startTime)}</span>
                <span>→</span>
                <span>{formatTime(breakPeriod.endTime)}</span>
              </div>
              <div className="break-duration">
                Duration: {formatDuration(breakPeriod.durationMinutes)}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Summary */}
      <div className="summary">
        <div className="summary-item">
          <label>Total Work:</label>
          <span>{record.totalWorkHours}</span>
        </div>
        <div className="summary-item">
          <label>Breaks:</label>
          <span>{record.breakHours}</span>
        </div>
        <div className="summary-item">
          <label>Actual Work:</label>
          <span>{record.actualWorkHours}</span>
        </div>
        {record.excessHours !== '00:00:00' && (
          <div className="summary-item overtime">
            <label>Overtime:</label>
            <span>{record.excessHours}</span>
          </div>
        )}
        {record.shortfallHours !== '00:00:00' && (
          <div className="summary-item shortfall">
            <label>Shortfall:</label>
            <span>{record.shortfallHours}</span>
          </div>
        )}
      </div>
    </div>
  );
};
```

### Example 3: Format Duration Helper

```typescript
// Helper function to format minutes to HH:mm:ss
const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  const secs = Math.floor((minutes % 1) * 60);
  
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

// Usage
const sessionDuration = formatDuration(workSession.durationMinutes);
// Output: "04:30:00" for 4.5 hours
```

### Example 4: Handle Status Values

```typescript
// Status mapping for UI
const statusConfig = {
  incomplete: { label: 'Incomplete', color: 'gray' },
  complete: { label: 'Complete', color: 'green' },
  duplicate_swipes: { label: 'Duplicate Swipes', color: 'orange' },
  missing_checkout: { label: 'Missing Checkout', color: 'red' },
  holiday_swipe: { label: 'Holiday Swipe', color: 'blue' },
  leave_swipe: { label: 'On Leave', color: 'purple' },
  pending_regularization: { label: 'Pending Regularization', color: 'yellow' },
  regularized: { label: 'Regularized', color: 'green' },
  overridden: { label: 'Overridden', color: 'blue' },
};

// Usage
const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status] || { label: status, color: 'gray' };
  return (
    <span className={`badge badge-${config.color}`}>
      {config.label}
    </span>
  );
};
```

---

## Frontend Implementation Checklist

### ✅ Required Updates

- [ ] **Update TypeScript interfaces** - Add new interfaces for `WorkSession`, `BreakPeriod`
- [ ] **Update swipe response handler** - Handle new optional fields
- [ ] **Update attendance record display** - Show all swipes, not just first/last
- [ ] **Add work sessions display** - Show work sessions when available
- [ ] **Add break periods display** - Show breaks when available
- [ ] **Update status badges** - Handle all status values
- [ ] **Add duration formatter** - Helper to format minutes to HH:mm:ss

### 🎨 UI/UX Enhancements (Optional)

- [ ] **Timeline view** - Visual timeline of all swipes
- [ ] **Work session cards** - Cards showing each work session
- [ ] **Break indicators** - Visual indicators for breaks
- [ ] **Overtime highlighting** - Highlight overtime sessions
- [ ] **Lunch break badges** - Special badge for lunch breaks
- [ ] **Swipe direction icons** - Icons for IN/OUT swipes
- [ ] **Multiple swipe summary** - Summary card showing total swipes

### 🔍 Testing Checklist

- [ ] **Test 2-swipe day** - Verify backward compatibility
- [ ] **Test 4-swipe day** - Verify multiple swipes display
- [ ] **Test with breaks** - Verify break periods display
- [ ] **Test without breaks** - Verify no break periods shown
- [ ] **Test incomplete swipes** - Verify missing checkout handling
- [ ] **Test error responses** - Verify error handling unchanged
- [ ] **Test optional fields** - Verify safe access to optional fields

---

## API Response Examples

### Example 1: First Swipe (IN)

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T09:00:00Z",
    "swipeDirection": "IN",
    "totalSwipes": 1,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": null,
    "status": "incomplete",
    "attendanceStatus": ["On-Time"],
    "totalWorkHours": "00:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "00:00:00"
  }
}
```

### Example 2: Second Swipe (OUT) - Complete Day

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T18:00:00Z",
    "swipeDirection": "OUT",
    "totalSwipes": 2,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": "2024-01-15T18:00:00Z",
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "totalWorkHours": "09:00:00",
    "breakHours": "00:00:00",
    "actualWorkHours": "09:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "00:00:00",
    "excessHours": "00:00:00",
    "workSessions": [
      {
        "sessionNumber": 1,
        "inTime": "2024-01-15T09:00:00Z",
        "outTime": "2024-01-15T18:00:00Z",
        "durationMinutes": 540,
        "isOvertime": false
      }
    ],
    "breakPeriods": []
  }
}
```

### Example 3: Multiple Swipes with Breaks

```json
{
  "success": true,
  "message": "Swipe processed successfully",
  "data": {
    "userId": "507f1f77bcf86cd799439011",
    "shiftCode": "DAY",
    "shiftDay": "2024-01-15T00:00:00Z",
    "swipeTime": "2024-01-15T18:00:00Z",
    "swipeDirection": "OUT",
    "totalSwipes": 4,
    "isWithinWindow": true,
    "firstIn": "2024-01-15T09:00:00Z",
    "lastOut": "2024-01-15T18:00:00Z",
    "status": "complete",
    "attendanceStatus": ["On-Time", "Present"],
    "totalWorkHours": "08:00:00",
    "breakHours": "01:00:00",
    "actualWorkHours": "08:00:00",
    "shiftHours": "09:00:00",
    "shortfallHours": "01:00:00",
    "excessHours": "00:00:00",
    "workSessions": [
      {
        "sessionNumber": 1,
        "inTime": "2024-01-15T09:00:00Z",
        "outTime": "2024-01-15T13:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      },
      {
        "sessionNumber": 2,
        "inTime": "2024-01-15T14:00:00Z",
        "outTime": "2024-01-15T18:00:00Z",
        "durationMinutes": 240,
        "isOvertime": false
      }
    ],
    "breakPeriods": [
      {
        "breakNumber": 1,
        "startTime": "2024-01-15T13:00:00Z",
        "endTime": "2024-01-15T14:00:00Z",
        "durationMinutes": 60,
        "isLunchBreak": true
      }
    ]
  }
}
```

### Example 4: Error Response (Unchanged)

```json
{
  "success": false,
  "message": "Minimum 1 minute gap required between swipes"
}
```

---

## Important Notes

### 1. Backward Compatibility

✅ **All existing frontend code will continue to work** without changes. The new fields are optional and only present when applicable.

### 2. Field Availability

- `swipeDirection` and `totalSwipes`: **Always present**
- `workSessions`: **Present when `totalSwipes >= 2`**
- `breakPeriods`: **Present when `totalSwipes >= 2` and breaks exist**

### 3. Time Format

All timestamps are in **UTC** and ISO 8601 format: `"2024-01-15T09:00:00Z"`

All duration fields are in **HH:mm:ss** format: `"09:00:00"`

### 4. Break Threshold

- Breaks < 15 minutes are **not counted** (not included in `breakPeriods`)
- Breaks >= 30 minutes are marked as **lunch breaks** (`isLunchBreak: true`)

### 5. Status Values

The `status` field can now be:
- `incomplete` - No swipes or incomplete pattern
- `complete` - Valid IN-OUT pairs
- `duplicate_swipes` - Consecutive same-direction swipes
- `missing_checkout` - Ends with IN (no final OUT)
- `holiday_swipe` - Holiday swipe
- `leave_swipe` - Leave swipe
- `pending_regularization` - Pending regularization
- `regularized` - Regularized
- `overridden` - Overridden

### 6. Attendance Status Array

`attendanceStatus` is always an **array** of strings:
- `['On-Time', 'Present']`
- `['Late', 'Present']`
- `['On-Time', 'Present', 'OT']`
- `['Late', 'Early-Exit']`

---

## Support

For questions or issues:
1. Check the [Full Flow Examples](./MULTIPLE_SWIPES_FULL_FLOW_EXAMPLES.md)
2. Check the [Deep Analysis](./COMPREHENSIVE_DEEP_ANALYSIS_ALL_SCENARIOS.md)
3. Contact the backend team

---

**Document Version:** 1.0.0  
**Last Updated:** 2024  
**Status:** ✅ Production Ready

