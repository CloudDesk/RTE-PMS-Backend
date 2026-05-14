# WFH Frontend Implementation Changes

## Overview

This document outlines the frontend changes required for the updated WFH balance validation system. The backend now enforces balance validation with the following rules:

- **If allocated days = 0**: Unlimited WFH (no restriction)
- **If allocated days > 0**: Balance validation applies (includes pending requests)

---

## Key Changes

### 1. Balance Validation Logic

**Previous Behavior:**
- WFH could be applied even if balance was 0
- No validation for allocated limits
- Pending requests were not considered

**New Behavior:**
- If `alloted = 0`: Unlimited WFH allowed
- If `alloted > 0`: Balance validation enforced
- Formula: `availableDays = alloted - availed - pending`
- Pending requests are included in balance calculation

### 2. API Response Changes

The backend now returns detailed error messages when balance is insufficient:

```typescript
// Error response format
{
  success: false,
  error: {
    message: "Insufficient WFH balance. Allocated: 18 days, Availed: 0 days, Pending: 18 days, Available: 0 days. Requested: 1 days exceeds available balance."
  }
}
```

---

## Implementation Guide

### Step 1: Update WFH Service/API

Create a helper function to load balance including pending requests:

```typescript
// services/wfh.service.ts or api/wfh.ts

import { wfhApi } from './wfh.service'; // or your API service

export interface WFHBalanceWithPending {
  alloted: number;
  availed: number;
  pending: number;
  available: number; // Real available balance (alloted - availed - pending)
  remaining: number; // Old calculation (for reference)
  isUnlimited: boolean; // true if alloted = 0
}

/**
 * Load WFH balance including pending requests for accurate validation
 */
export async function loadWFHBalanceWithPending(
  userId: string,
  year: number
): Promise<WFHBalanceWithPending | null> {
  try {
    // 1. Get WFH summary (alloted and availed)
    const balanceResponse = await wfhApi.getBalance(year);
    
    if (!balanceResponse.success || !balanceResponse.data) {
      return null;
    }

    // 2. Get pending WFH requests for the same year
    const pendingResponse = await wfhApi.getRequests({
      userId,
      status: 'Pending',
      startDate: new Date(year, 0, 1).toISOString().split('T')[0], // Jan 1
      endDate: new Date(year, 11, 31).toISOString().split('T')[0], // Dec 31
    });

    // 3. Calculate pending days
    const pendingDays = pendingResponse.success && pendingResponse.data?.data
      ? pendingResponse.data.data.reduce(
          (sum: number, wfh: any) => sum + (wfh.noOfDays || 0), 
          0
        )
      : 0;

    const alloted = balanceResponse.data.alloted || 0;
    const availed = balanceResponse.data.availed || 0;
    const isUnlimited = alloted === 0;
    
    // 4. Calculate available balance including pending
    const availableDays = isUnlimited 
      ? Infinity // Unlimited if alloted = 0
      : alloted - availed - pendingDays;

    return {
      alloted,
      availed,
      pending: pendingDays,
      available: availableDays,
      remaining: balanceResponse.data.remaining, // Old calculation
      isUnlimited,
    };
  } catch (error) {
    console.error('Failed to load WFH balance with pending:', error);
    return null;
  }
}
```

---

### Step 2: Update WFH Form Component

#### React/TypeScript Example

```typescript
// components/WFHApplyForm.tsx
import { useState, useEffect } from 'react';
import { wfhApi } from '../services/wfh.service';
import { useAuth } from '../hooks/useAuth';
import { loadWFHBalanceWithPending, WFHBalanceWithPending } from '../services/wfh.service';
import { toast } from 'react-toastify'; // or your toast library

export const WFHApplyForm = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    startDate: '',
    endDate: '',
    reason: '',
    remarks: '',
  });
  const [balance, setBalance] = useState<WFHBalanceWithPending | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // Calculate requested days
  const calculateDays = () => {
    if (!formData.startDate || !formData.endDate) return 0;
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const requestedDays = calculateDays();

  // Load balance with pending when start date changes
  const loadBalance = async () => {
    if (!formData.startDate || !user?._id) {
      setBalance(null);
      return;
    }
    
    setIsLoadingBalance(true);
    try {
      const year = new Date(formData.startDate).getFullYear();
      const balanceData = await loadWFHBalanceWithPending(user._id, year);
      setBalance(balanceData);
    } catch (error) {
      console.error('Failed to load balance:', error);
      toast.error('Failed to load WFH balance');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  // Load balance when start date changes
  useEffect(() => {
    loadBalance();
  }, [formData.startDate]);

  // Validation
  const exceedsBalance = balance && !balance.isUnlimited && requestedDays > balance.available;
  const isValid = 
    formData.startDate && 
    formData.endDate && 
    formData.reason.trim().length > 0 &&
    (!balance || balance.isUnlimited || !exceedsBalance);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Frontend validation
    if (exceedsBalance) {
      toast.error(
        `Cannot apply for ${requestedDays} days. ` +
        `Available balance: ${balance?.available} days (including pending requests)`
      );
      return;
    }

    setLoading(true);
    try {
      const response = await wfhApi.apply({
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason,
        remarks: formData.remarks,
      });

      if (response.success) {
        toast.success('WFH request submitted successfully!');
        // Reset form
        setFormData({
          startDate: '',
          endDate: '',
          reason: '',
          remarks: '',
        });
        setBalance(null);
      }
    } catch (error: any) {
      // Backend now returns detailed error message
      const errorMessage = error?.response?.data?.error?.message 
        || error?.error?.message 
        || error?.message 
        || 'Failed to submit WFH request';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Start Date */}
      <div className="form-control">
        <label className="label">
          <span className="label-text">Start Date</span>
          <span className="text-error">*</span>
        </label>
        <input
          type="date"
          className="input input-bordered"
          value={formData.startDate}
          onChange={(e) => {
            setFormData({ ...formData, startDate: e.target.value });
          }}
          required
        />
      </div>

      {/* End Date */}
      <div className="form-control">
        <label className="label">
          <span className="label-text">End Date</span>
          <span className="text-error">*</span>
        </label>
        <input
          type="date"
          className="input input-bordered"
          value={formData.endDate}
          min={formData.startDate}
          onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
          required
        />
      </div>

      {/* Balance Display */}
      {isLoadingBalance ? (
        <div className="alert alert-info">
          <span>Loading balance...</span>
        </div>
      ) : balance && formData.startDate ? (
        <div className={`alert ${balance.isUnlimited ? 'alert-success' : (exceedsBalance ? 'alert-error' : 'alert-info')}`}>
          <div className="space-y-1">
            {balance.isUnlimited ? (
              <>
                <div><strong>Unlimited WFH Available</strong></div>
                <div className="text-sm">Allocated: 0 days (No restriction)</div>
              </>
            ) : (
              <>
                <div><strong>Available Balance: {balance.available} days</strong></div>
                <div className="text-sm">
                  Allocated: {balance.alloted} days | 
                  Availed: {balance.availed} days | 
                  Pending: {balance.pending} days
                </div>
                {exceedsBalance && (
                  <div className="text-sm font-semibold">
                    ⚠️ Requested days ({requestedDays} days) exceeds available balance ({balance.available} days)
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Days Calculation Display */}
      {formData.startDate && formData.endDate && (
        <div className="bg-gray-50 p-3 rounded">
          <span className="text-sm">Requested: <strong>{requestedDays} days</strong></span>
        </div>
      )}

      {/* Reason */}
      <div className="form-control">
        <label className="label">
          <span className="label-text">Reason</span>
          <span className="text-error">*</span>
        </label>
        <textarea
          className="textarea textarea-bordered h-24"
          value={formData.reason}
          onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
          placeholder="Enter reason for WFH"
          required
        />
      </div>

      {/* Remarks */}
      <div className="form-control">
        <label className="label">
          <span className="label-text">Remarks</span>
        </label>
        <textarea
          className="textarea textarea-bordered h-24"
          value={formData.remarks}
          onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          placeholder="Optional remarks"
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setFormData({
              startDate: '',
              endDate: '',
              reason: '',
              remarks: '',
            });
            setBalance(null);
          }}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !isValid || (balance && !balance.isUnlimited && exceedsBalance)}
        >
          {loading ? 'Submitting...' : 'Apply for WFH'}
        </button>
      </div>
    </form>
  );
};
```

#### Svelte Example

```svelte
<!-- components/WFHApplyForm.svelte -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { wfhApi } from "$lib/services/api/wfh";
  import { auth } from "$lib/stores/auth";
  import { toast } from "$lib/components/common/stores/toast.store";
  import type { WFHCreateRequest } from "$lib/types/wfh";

  export let loading = false;

  const dispatch = createEventDispatcher<{
    submit: WFHCreateRequest;
    cancel: void;
  }>();

  let startDate: string = '';
  let endDate: string = '';
  let reason: string = '';
  let remarks: string = '';

  // Balance tracking
  let availableBalance: number = Infinity;
  let alloted: number = 0;
  let availed: number = 0;
  let pending: number = 0;
  let isUnlimited: boolean = false;
  let isLoadingBalance = false;

  $: user = $auth.user;

  // Calculate requested days
  $: requestedDays = (() => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  })();

  // Load balance when start date changes
  $: if (startDate && user?._id) {
    loadBalance();
  }

  async function loadBalance() {
    if (!startDate || !user?._id) return;

    isLoadingBalance = true;
    try {
      const year = new Date(startDate).getFullYear();

      // Get WFH summary (alloted and availed)
      const summaryResponse = await wfhApi.getBalance(year);
      if (summaryResponse.success && summaryResponse.data) {
        alloted = summaryResponse.data.alloted || 0;
        availed = summaryResponse.data.availed || 0;
        isUnlimited = alloted === 0;
      }

      // Get pending WFH requests for the same year
      const pendingResponse = await wfhApi.getRequests({
        userId: user._id,
        status: 'Pending',
        startDate: new Date(year, 0, 1).toISOString().split('T')[0],
        endDate: new Date(year, 11, 31).toISOString().split('T')[0],
      });

      if (pendingResponse.success && pendingResponse.data?.data) {
        // Calculate total pending days for the year
        pending = pendingResponse.data.data.reduce(
          (sum: number, wfh: any) => sum + (wfh.noOfDays || 0),
          0
        );
      }

      // Calculate available balance
      availableBalance = isUnlimited
        ? Infinity
        : alloted - availed - pending;
    } catch (error: any) {
      console.error('Failed to load balance:', error);
      toast.error('Failed to load WFH balance');
    } finally {
      isLoadingBalance = false;
    }
  }

  onMount(() => {
    if (user?._id && startDate) {
      loadBalance();
    }
  });

  // Validation
  $: exceedsBalance = !isUnlimited && requestedDays > availableBalance;
  $: isValid =
    startDate &&
    endDate &&
    reason.trim().length > 0 &&
    (isUnlimited || !exceedsBalance);

  function handleSubmit() {
    if (!isValid) {
      if (exceedsBalance) {
        toast.error(
          `Cannot apply for ${requestedDays} days. Available balance: ${availableBalance} days (including pending requests)`
        );
      }
      return;
    }

    const wfhData: WFHCreateRequest = {
      startDate,
      endDate,
      reason,
      remarks: remarks || undefined,
      appliedTo: {
        _id: user?.managerId || '',
        name: user?.managerName || '',
      },
    };

    dispatch('submit', wfhData);
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="space-y-4">
  <!-- Balance Display -->
  {#if isLoadingBalance}
    <div class="alert alert-info">
      <span>Loading balance...</span>
    </div>
  {:else if startDate && user?._id}
    <div class="alert {isUnlimited ? 'alert-success' : (exceedsBalance ? 'alert-error' : 'alert-info')}">
      <div class="space-y-1">
        {#if isUnlimited}
          <div><strong>Unlimited WFH Available</strong></div>
          <div class="text-sm">Allocated: 0 days (No restriction)</div>
        {:else}
          <div><strong>Available Balance: {availableBalance} days</strong></div>
          <div class="text-sm">
            Allocated: {alloted} days | 
            Availed: {availed} days | 
            Pending: {pending} days
          </div>
          {#if exceedsBalance}
            <div class="text-sm font-semibold">
              ⚠️ Requested days ({requestedDays} days) exceeds available balance ({availableBalance} days)
            </div>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <form on:submit|preventDefault={handleSubmit} class="space-y-4">
    <!-- Start Date -->
    <div class="form-control">
      <label class="label">
        <span class="label-text">Start Date</span>
        <span class="text-error">*</span>
      </label>
      <input
        type="date"
        class="input input-bordered"
        bind:value={startDate}
        required
      />
    </div>

    <!-- End Date -->
    <div class="form-control">
      <label class="label">
        <span class="label-text">End Date</span>
        <span class="text-error">*</span>
      </label>
      <input
        type="date"
        class="input input-bordered"
        bind:value={endDate}
        min={startDate}
        required
      />
    </div>

    <!-- Days Calculation Display -->
    {#if startDate && endDate}
      <div class="bg-gray-50 p-3 rounded">
        <span class="text-sm">Requested: <strong>{requestedDays} days</strong></span>
      </div>
    {/if}

    <!-- Reason -->
    <div class="form-control">
      <label class="label">
        <span class="label-text">Reason</span>
        <span class="text-error">*</span>
      </label>
      <textarea
        class="textarea textarea-bordered h-24"
        bind:value={reason}
        placeholder="Enter reason for WFH"
        required
      ></textarea>
    </div>

    <!-- Remarks -->
    <div class="form-control">
      <label class="label">
        <span class="label-text">Remarks</span>
      </label>
      <textarea
        class="textarea textarea-bordered h-24"
        bind:value={remarks}
        placeholder="Optional remarks"
      ></textarea>
    </div>

    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="btn btn-ghost"
        on:click={handleCancel}
        disabled={loading}
      >
        Cancel
      </button>
      <button
        type="submit"
        class="btn btn-primary"
        disabled={loading || !isValid || exceedsBalance}
      >
        {loading ? "Submitting..." : "Apply for WFH"}
      </button>
    </div>
  </form>
</div>
```

---

### Step 3: Update Error Handling

Update your error handling to display detailed backend error messages:

```typescript
// utils/errorHandler.ts or in your component
export const handleWFHError = (error: any): string => {
  // Backend now returns detailed error messages
  if (error?.response?.data?.error?.message) {
    return error.response.data.error.message;
  }
  if (error?.error?.message) {
    return error.error.message;
  }
  if (error?.message) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

// Usage in component
try {
  await wfhApi.apply(data);
} catch (error) {
  const message = handleWFHError(error);
  toast.error(message);
}
```

---

## Testing Scenarios

### Test Case 1: Unlimited WFH (Allocated = 0)

1. User has 0 days allocated
2. Apply for 30 days
3. **Expected**: ✅ Success (unlimited)
4. **UI**: Should show "Unlimited WFH Available"

### Test Case 2: Limited WFH (Allocated = 18)

1. User has 18 days allocated
2. Apply for 18 days
3. **Expected**: ✅ Success
4. **UI**: Should show available balance = 18 days

### Test Case 3: Exceeding Balance

1. User has 18 days allocated
2. Apply for 18 days (Pending)
3. Try to apply for another 1 day
4. **Expected**: ❌ Error with detailed message
5. **UI**: Should show warning before submission, disable submit button

### Test Case 4: After Approval

1. User has 18 days allocated
2. Apply for 18 days → Approve
3. Try to apply for another 1 day
4. **Expected**: ❌ Error "Available: 0 days"
5. **UI**: Should show available balance = 0 days

### Test Case 5: After Rejection

1. User has 18 days allocated
2. Apply for 18 days → Reject
3. Try to apply for another 18 days
4. **Expected**: ✅ Success (rejected doesn't count)
5. **UI**: Should show available balance = 18 days

---

## API Endpoints Reference

### Get WFH Balance
```typescript
GET /api/wfh/balance/:year

Response: {
  success: boolean;
  data: {
    alloted: number;
    availed: number;
    remaining: number; // alloted - availed (old calculation)
  };
}
```

### Get WFH Requests (for pending calculation)
```typescript
GET /api/wfh?userId={userId}&status=Pending&startDate={start}&endDate={end}

Response: {
  success: boolean;
  data: {
    data: WFH[];
    total: number;
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}
```

### Apply for WFH
```typescript
POST /api/wfh

Body: {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  remarks?: string;
}

Success Response (201): {
  success: true;
  data: WFH;
}

Error Response (400): {
  success: false;
  error: {
    message: "Insufficient WFH balance. Allocated: 18 days, Availed: 0 days, Pending: 18 days, Available: 0 days. Requested: 1 days exceeds available balance."
  };
}
```

---

## Key Implementation Points

### 1. Balance Calculation Formula

```typescript
// If alloted = 0: Unlimited
if (alloted === 0) {
  availableDays = Infinity;
  isUnlimited = true;
} else {
  // If alloted > 0: Calculate with pending
  availableDays = alloted - availed - pending;
  isUnlimited = false;
}
```

### 2. Validation Logic

```typescript
// Frontend validation
const exceedsBalance = !isUnlimited && requestedDays > availableDays;

// Disable submit if exceeds balance (only if not unlimited)
disabled={loading || (!isUnlimited && exceedsBalance)}
```

### 3. UI Display Logic

```typescript
// Show different UI based on unlimited status
{isUnlimited ? (
  <div>Unlimited WFH Available</div>
) : (
  <div>
    Available: {availableDays} days
    Allocated: {alloted} | Availed: {availed} | Pending: {pending}
  </div>
)}
```

---

## Migration Checklist

- [ ] Update WFH service to fetch pending requests
- [ ] Create `loadWFHBalanceWithPending` helper function
- [ ] Update WFH form component to use new balance calculation
- [ ] Add pending days display in UI
- [ ] Handle unlimited case (alloted = 0)
- [ ] Add frontend validation before submission
- [ ] Update error handling to show detailed backend messages
- [ ] Disable submit button when balance is exceeded
- [ ] Test all scenarios (unlimited, limited, pending, etc.)
- [ ] Update documentation

---

## Notes

1. **Pending requests** should only count for the **same year** as the new request
2. **Rejected** and **Cancelled** requests should **NOT** count against balance
3. **Approved** requests count as "availed" and reduce available balance
4. Balance is calculated **per year** (not monthly like permissions)
5. **Allocated = 0** means unlimited WFH (no validation)
6. **Allocated > 0** means balance validation is enforced

---

## Summary

### ✅ **Backend Changes (Already Implemented)**
- Balance validation with pending days
- Unlimited WFH when allocated = 0
- Detailed error messages

### ✅ **Frontend Changes (Required)**
- Fetch pending WFH requests when loading balance
- Calculate available balance including pending
- Display pending days in UI
- Handle unlimited case
- Validate before form submission
- Show warnings when balance exceeded
- Display detailed backend error messages

---

## Support

For questions or issues, refer to:
- Backend API documentation
- WFH service implementation (`src/services/wfh.service.ts`)
- WFH routes (`src/routes/wfh.routes.ts`)

