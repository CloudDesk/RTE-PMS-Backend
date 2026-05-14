# Restricted Holiday (Optional Holiday) Frontend Implementation Guide

## 📋 Overview

This document outlines all frontend changes required to support the new **Restricted Holiday** feature, where admins can allocate different optional holiday counts per user per year, stored in `leave-summary.restricted_holiday`.

**Key Change:** Optional holiday limit is now **dynamic per user** (stored in leave-summary) instead of hardcoded 2.

---

## 🎯 What Changed in Backend

### Before:
- Hardcoded limit: `MAX_OPTIONAL_HOLIDAYS_PER_YEAR = 2` (same for all users)
- Limit checked against hardcoded value

### After:
- Dynamic limit: Stored in `leave-summary.restricted_holiday.alloted` (per user, per year)
- Default value: 2 (if not allocated by admin)
- Admin can allocate different counts per user
- System tracks: `alloted`, `availed`, `remaining` in leave-summary

---

## 📡 API Changes

### 1. Leave Summary API - New Field

**Endpoint:** `GET /api/leave-summary/summary/:userId?year=2025`

**Response Now Includes:**
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "year": 2025,
    "annual": { "alloted": 12, "availed": 5, "remaining": 7 },
    "sick": { "alloted": 6, "availed": 2, "remaining": 4 },
    // ... other leave types
    "restricted_holiday": {
      "alloted": 3,        // NEW: Admin allocated count
      "availed": 1,        // NEW: Approved optional holidays count
      "remaining": 2,     // NEW: Available optional holidays
      "leaveRequests": []  // NEW: Array of optional holiday request IDs
    }
  }
}
```

### 2. Leave Allotment API - New Field

**Endpoint:** `POST /api/leave-summary/allotments`

**Request Body - New Field:**
```json
{
  "userId": "user123",
  "year": 2025,
  "annual": 12,
  "sick": 6,
  // ... other leave types
  "restricted_holiday": 3  // NEW: Admin can set optional holiday allocation
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user123",
    "year": 2025,
    "restricted_holiday": {
      "alloted": 3,
      "availed": 0,
      "remaining": 3
    }
    // ... other leave types
  }
}
```

### 3. Optional Holiday Limit API - Updated Response

**Endpoint:** `GET /api/optional-holidays/user/:userId/limit?year=2025`

**Response Changed:**
```json
{
  "success": true,
  "data": {
    "canRequest": true,
    "used": 1,           // Approved optional holidays count
    "remaining": 2,      // Available optional holidays
    "total": 3           // NEW: Total allocated (from leave-summary)
  }
}
```

**Before:** `total` was always `2`  
**After:** `total` is dynamic (from `leave-summary.restricted_holiday.alloted`)

### 4. Optional Holiday Usage Summary - Updated Response

**Endpoint:** `GET /api/optional-holidays/user/:userId/summary?year=2025`

**Response Changed:**
```json
{
  "success": true,
  "data": {
    "total": 3,          // NEW: Dynamic (was always 2)
    "used": 1,
    "remaining": 2,
    "requests": [...]
  }
}
```

---

## 🎨 Frontend Changes Required

### 1. Leave Summary Display Component

**File:** `components/LeaveSummary/LeaveSummaryCard.tsx` (or similar)

**Changes:**
- Add `restricted_holiday` to the leave types list
- Display: Alloted, Availed, Remaining

**Example:**
```tsx
const LeaveSummaryCard = ({ summary }) => {
  const leaveTypes = [
    { key: 'annual', label: 'Annual Leave' },
    { key: 'sick', label: 'Sick Leave' },
    { key: 'compOff', label: 'Comp Off' },
    { key: 'lossOfPay', label: 'Loss of Pay' },
    { key: 'otherPaid', label: 'Other Paid' },
    { key: 'otherUnpaid', label: 'Other Unpaid' },
    { key: 'maternity', label: 'Maternity' },
    { key: 'workFromHome', label: 'Work From Home' },
    { key: 'restricted_holiday', label: 'Restricted Holiday' }, // NEW
  ];

  return (
    <div className="leave-summary-grid">
      {leaveTypes.map(type => (
        <div key={type.key} className="leave-card">
          <h3>{type.label}</h3>
          <div className="leave-stats">
            <span>Alloted: {summary[type.key]?.alloted || 0}</span>
            <span>Availed: {summary[type.key]?.availed || 0}</span>
            <span>Remaining: {summary[type.key]?.remaining || 0}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
```

### 2. Leave Allotment Form Component

**File:** `components/LeaveAllotment/LeaveAllotmentForm.tsx` (or similar)

**Changes:**
- Add `restricted_holiday` input field
- Include in form submission

**Example:**
```tsx
const LeaveAllotmentForm = ({ onSubmit }) => {
  const [formData, setFormData] = useState({
    userId: '',
    year: new Date().getFullYear(),
    annual: 0,
    sick: 0,
    compOff: 0,
    lossOfPay: 0,
    otherPaid: 0,
    otherUnpaid: 0,
    maternity: 0,
    workFromHome: 0,
    restricted_holiday: 2, // NEW: Default to 2
  });

  return (
    <form onSubmit={handleSubmit}>
      {/* Existing fields */}
      
      {/* NEW: Restricted Holiday Field */}
      <div className="form-group">
        <label htmlFor="restricted_holiday">
          Restricted Holiday (Optional Holiday) Allocation
        </label>
        <input
          type="number"
          id="restricted_holiday"
          min="0"
          value={formData.restricted_holiday}
          onChange={(e) => setFormData({
            ...formData,
            restricted_holiday: parseInt(e.target.value) || 0
          })}
          placeholder="Default: 2"
        />
        <small>
          Number of optional holidays the employee can request this year
        </small>
      </div>

      <button type="submit">Update Allotments</button>
    </form>
  );
};
```

### 3. Optional Holiday Request Component

**File:** `components/OptionalHoliday/OptionalHolidayRequest.tsx` (or similar)

**Changes:**
- Update limit display to show dynamic total
- Update error messages to use dynamic limit

**Example:**
```tsx
const OptionalHolidayRequest = () => {
  const [limit, setLimit] = useState({ total: 2, used: 0, remaining: 2 });
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch limit from API
    const fetchLimit = async () => {
      try {
        const response = await fetch(
          `/api/optional-holidays/user/${userId}/limit?year=${year}`
        );
        const data = await response.json();
        if (data.success) {
          setLimit(data.data); // Now includes dynamic 'total'
        }
      } catch (err) {
        console.error('Failed to fetch limit:', err);
      }
    };
    fetchLimit();
  }, [userId, year]);

  const handleSubmit = async (formData) => {
    try {
      const response = await fetch('/api/optional-holidays', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      const data = await response.json();
      
      if (!data.success) {
        // Error message now includes dynamic limit
        // e.g., "Annual limit reached. You have already used 2 out of 3 optional holidays"
        setError(data.error?.message || 'Failed to create request');
      }
    } catch (err) {
      setError('Failed to create request');
    }
  };

  return (
    <div className="optional-holiday-request">
      <div className="limit-info">
        <p>
          <strong>Optional Holiday Limit:</strong> {limit.used} / {limit.total} used
        </p>
        <p>
          <strong>Remaining:</strong> {limit.remaining}
        </p>
      </div>

      {limit.remaining === 0 && (
        <div className="alert alert-warning">
          You have reached your annual limit of {limit.total} optional holidays for {year}.
        </div>
      )}

      {/* Request form */}
    </div>
  );
};
```

### 4. Optional Holiday Usage Summary Component

**File:** `components/OptionalHoliday/OptionalHolidaySummary.tsx` (or similar)

**Changes:**
- Update to display dynamic total instead of hardcoded 2

**Example:**
```tsx
const OptionalHolidaySummary = ({ userId, year }) => {
  const [summary, setSummary] = useState({
    total: 2,      // Will be updated from API
    used: 0,
    remaining: 2,
    requests: []
  });

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetch(
          `/api/optional-holidays/user/${userId}/summary?year=${year}`
        );
        const data = await response.json();
        if (data.success) {
          setSummary(data.data); // 'total' is now dynamic
        }
      } catch (err) {
        console.error('Failed to fetch summary:', err);
      }
    };
    fetchSummary();
  }, [userId, year]);

  return (
    <div className="optional-holiday-summary">
      <h3>Optional Holiday Usage - {year}</h3>
      <div className="summary-stats">
        <div className="stat-card">
          <label>Total Allocated</label>
          <span className="value">{summary.total}</span>
        </div>
        <div className="stat-card">
          <label>Used</label>
          <span className="value">{summary.used}</span>
        </div>
        <div className="stat-card">
          <label>Remaining</label>
          <span className="value">{summary.remaining}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div 
          className="progress-fill"
          style={{ width: `${(summary.used / summary.total) * 100}%` }}
        />
      </div>

      {/* Requests list */}
      <div className="requests-list">
        {summary.requests.map(request => (
          <RequestCard key={request._id} request={request} />
        ))}
      </div>
    </div>
  );
};
```

### 5. TypeScript Interfaces Update

**File:** `types/leaveSummary.ts` (or similar)

**Add:**
```typescript
export interface LeaveCategoryDetail {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: string[];
}

export interface LeaveSummary {
  userId: string;
  year: number;
  annual: LeaveCategoryDetail;
  sick: LeaveCategoryDetail;
  compOff: LeaveCategoryDetail;
  lossOfPay: LeaveCategoryDetail;
  otherPaid: LeaveCategoryDetail;
  otherUnpaid: LeaveCategoryDetail;
  maternity: LeaveCategoryDetail;
  workFromHome: LeaveCategoryDetail;
  restricted_holiday: LeaveCategoryDetail; // NEW
}

export interface OptionalHolidayLimit {
  canRequest: boolean;
  used: number;
  remaining: number;
  total: number; // NEW: Dynamic total (was always 2)
}

export interface OptionalHolidayUsageSummary {
  total: number;    // NEW: Dynamic (was always 2)
  used: number;
  remaining: number;
  requests: OptionalHolidayRequest[];
}
```

### 6. API Service Functions Update

**File:** `services/optionalHolidayService.ts` (or similar)

**Update:**
```typescript
// Update interface
export interface AnnualLimit {
  canRequest: boolean;
  used: number;
  remaining: number;
  total: number; // NEW: Dynamic total
}

// Update function
export const checkAnnualLimit = async (
  userId: string,
  year: number
): Promise<AnnualLimit> => {
  const response = await fetch(
    `/api/optional-holidays/user/${userId}/limit?year=${year}`
  );
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to check limit');
  }
  
  return data.data; // Now includes 'total' field
};

// Update usage summary
export const getUsageSummary = async (
  userId: string,
  year: number
): Promise<OptionalHolidayUsageSummary> => {
  const response = await fetch(
    `/api/optional-holidays/user/${userId}/summary?year=${year}`
  );
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error?.message || 'Failed to get summary');
  }
  
  return data.data; // 'total' is now dynamic
};
```

### 7. Error Message Updates

**File:** `components/OptionalHoliday/OptionalHolidayRequest.tsx`

**Update error messages to use dynamic limit:**
```tsx
// Before:
if (error.message.includes('Annual limit reached')) {
  setError(`You have reached the annual limit of 2 optional holidays`);
}

// After:
if (error.message.includes('Annual limit reached')) {
  // Error message from API now includes dynamic limit
  // e.g., "Annual limit reached. You have already used 2 out of 3 optional holidays"
  setError(error.message);
}
```

### 8. Admin Dashboard - Leave Allotment

**File:** `pages/Admin/LeaveAllotment.tsx` (or similar)

**Changes:**
- Add `restricted_holiday` field to bulk allotment form
- Display `restricted_holiday` in leave summary table

**Example:**
```tsx
const LeaveAllotmentPage = () => {
  const [allotments, setAllotments] = useState({
    annual: 0,
    sick: 0,
    // ... other fields
    restricted_holiday: 2, // NEW: Default to 2
  });

  const columns = [
    { key: 'annual', label: 'Annual' },
    { key: 'sick', label: 'Sick' },
    // ... other columns
    { key: 'restricted_holiday', label: 'Restricted Holiday' }, // NEW
  ];

  return (
    <div>
      <h1>Leave Allotment</h1>
      <form onSubmit={handleSubmit}>
        {columns.map(col => (
          <input
            key={col.key}
            type="number"
            label={col.label}
            value={allotments[col.key]}
            onChange={(e) => setAllotments({
              ...allotments,
              [col.key]: parseInt(e.target.value) || 0
            })}
          />
        ))}
        <button type="submit">Update Allotments</button>
      </form>
    </div>
  );
};
```

---

## 🔄 Migration Notes

### Backward Compatibility
- Existing users without `restricted_holiday` allocation will default to **2**
- Frontend should handle cases where `restricted_holiday` is `undefined` or `null`
- Always use: `summary.restricted_holiday?.alloted || 2`

### Default Values
- If admin doesn't allocate: Default is **2**
- If `alloted = 0`: System treats as **2** (backward compatibility)
- Frontend should display default as **2** if not set

---

## ✅ Checklist

### Components to Update:
- [ ] Leave Summary Display Component
- [ ] Leave Allotment Form Component
- [ ] Optional Holiday Request Component
- [ ] Optional Holiday Usage Summary Component
- [ ] Optional Holiday Limit Display Component
- [ ] Admin Leave Allotment Page
- [ ] TypeScript Interfaces
- [ ] API Service Functions
- [ ] Error Message Handlers

### Features to Test:
- [ ] Display dynamic limit in optional holiday request form
- [ ] Show correct remaining count
- [ ] Admin can allocate different counts per user
- [ ] Error messages show dynamic limits
- [ ] Leave summary shows restricted_holiday data
- [ ] Bulk allotment includes restricted_holiday
- [ ] Default value (2) works for existing users

---

## 📝 Example API Calls

### Get Leave Summary (includes restricted_holiday)
```typescript
GET /api/leave-summary/summary/user123?year=2025

Response:
{
  "success": true,
  "data": {
    "restricted_holiday": {
      "alloted": 3,
      "availed": 1,
      "remaining": 2
    }
  }
}
```

### Update Leave Allotment (set restricted_holiday)
```typescript
POST /api/leave-summary/allotments

Body:
{
  "userId": "user123",
  "year": 2025,
  "restricted_holiday": 3
}
```

### Check Optional Holiday Limit (dynamic total)
```typescript
GET /api/optional-holidays/user/user123/limit?year=2025

Response:
{
  "success": true,
  "data": {
    "canRequest": true,
    "used": 1,
    "remaining": 2,
    "total": 3  // Dynamic from leave-summary
  }
}
```

---

## 🎯 Key Points

1. **Dynamic Limit**: Optional holiday limit is now per-user, per-year (not hardcoded 2)
2. **Leave Summary**: `restricted_holiday` is part of leave summary (like other leave types)
3. **Admin Control**: Admins can allocate different counts via leave allotment API
4. **Backward Compatible**: Defaults to 2 if not allocated
5. **Real-time Tracking**: `availed` and `remaining` are tracked in leave-summary

---

## 📞 Support

For questions or issues, refer to:
- Backend API Documentation: `/api/documentation`
- Leave Summary API: `GET /api/leave-summary/summary/:userId`
- Optional Holiday API: `GET /api/optional-holidays/user/:userId/limit`

---

**Last Updated:** January 2025  
**Version:** 1.0.0

