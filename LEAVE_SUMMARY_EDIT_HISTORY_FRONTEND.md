# Leave Summary Edit History - Frontend Implementation Guide

## Overview

This guide explains how to implement the frontend for displaying leave summary edit history. The API now tracks all manual edits to leave allotments, including who made the change, what field was changed, and the old/new values.

## API Endpoint

### Get Leave Summary with Edit History

```
GET /api/leave-summary/summary/:userId?year=2026
```

**Response Structure:**
```json
{
  "success": true,
  "data": {
    "userId": "69735bcc77ea11ab2d790594",
    "year": 2026,
    "annual": {
      "alloted": 3,
      "availed": 0,
      "remaining": 3,
      "leaveRequests": []
    },
    "sick": { ... },
    "compOff": { ... },
    "editHistory": [
      {
        "editedBy": {
          "id": "69735bcc77ea11ab2d790594",
          "name": "Admin User"
        },
        "field": "annual.alloted",
        "oldValue": 4,
        "newValue": 3,
        "editedAt": "2026-01-28T10:30:00.000Z"
      },
      {
        "editedBy": {
          "id": "69735bcc77ea11ab2d790594",
          "name": "HR Manager"
        },
        "field": "sick.alloted",
        "oldValue": 5,
        "newValue": 6,
        "editedAt": "2026-01-27T14:20:00.000Z"
      }
    ]
  }
}
```

---

## How to Get Values and Access Fields

### Step 1: Get API Response

```typescript
// Call the API
const response = await fetch('/api/leave-summary/summary/69735bcc77ea11ab2d790594?year=2026');
const data = await response.json();

// Access editHistory array
const editHistory = data.data.editHistory; // Array of edit history entries
```

### Step 2: Access Individual Fields

```typescript
// Access first edit entry
const firstEdit = editHistory[0];

// Get individual field values
const editorId = firstEdit.editedBy.id;        // "69735bcc77ea11ab2d790594"
const editorName = firstEdit.editedBy.name;    // "Admin User"
const fieldName = firstEdit.field;              // "annual.alloted"
const oldValue = firstEdit.oldValue;            // 4
const newValue = firstEdit.newValue;            // 3
const editDate = firstEdit.editedAt;            // "2026-01-28T10:30:00.000Z"
```

### Step 3: Map Field Names to Display Labels

```typescript
// Field mapping function
function getFieldLabel(field: string): string {
  const fieldMap: Record<string, string> = {
    'annual.alloted': 'Annual Leave',
    'sick.alloted': 'Sick Leave',
    'compOff.alloted': 'Comp Off',
    'lossOfPay.alloted': 'Loss of Pay',
    'otherPaid.alloted': 'Other Paid',
    'otherUnpaid.alloted': 'Other Unpaid',
    'maternity.alloted': 'Maternity Leave',
    'workFromHome.alloted': 'Work From Home',
    'restricted_holiday.alloted': 'Restricted Holiday',
  };
  return fieldMap[field] || field;
}

// Usage
const displayLabel = getFieldLabel('annual.alloted'); // Returns "Annual Leave"
```

### Step 4: Extract Category from Field Name

```typescript
// Extract leave category from field name
function getCategoryFromField(field: string): string {
  // field format: "annual.alloted" -> extract "annual"
  return field.split('.')[0]; // Returns "annual"
}

// Usage
const category = getCategoryFromField('annual.alloted'); // Returns "annual"
```

### Step 5: Calculate Change Amount

```typescript
// Calculate the difference
function getChangeAmount(oldValue: number, newValue: number): number {
  return newValue - oldValue; // Returns positive or negative number
}

// Usage
const change = getChangeAmount(4, 3); // Returns -1 (decreased)
const change2 = getChangeAmount(5, 6); // Returns +1 (increased)
```

---

## TypeScript Types

```typescript
// types/leave-summary.ts

export interface EditHistoryEntry {
  editedBy: {
    id: string;
    name: string;
  };
  field: string; // e.g., "annual.alloted", "sick.alloted"
  oldValue: number;
  newValue: number;
  editedAt: string; // ISO date string
}

export interface LeaveCategory {
  alloted: number;
  availed: number;
  remaining: number;
  leaveRequests: string[];
}

export interface LeaveSummary {
  userId: string;
  year: number;
  annual: LeaveCategory;
  sick: LeaveCategory;
  compOff: LeaveCategory;
  lossOfPay: LeaveCategory;
  otherPaid: LeaveCategory;
  otherUnpaid: LeaveCategory;
  maternity: LeaveCategory;
  workFromHome: LeaveCategory;
  restricted_holiday: LeaveCategory;
  editHistory: EditHistoryEntry[];
}

export interface LeaveSummaryResponse {
  success: boolean;
  data: LeaveSummary;
}
```

---

## React Implementation

### 1. API Service

```typescript
// services/leaveSummaryService.ts

import axios from 'axios';
import { LeaveSummaryResponse } from '../types/leave-summary';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5800';

export const leaveSummaryService = {
  /**
   * Get leave summary with edit history
   */
  async getLeaveSummary(
    userId: string,
    year: number = new Date().getFullYear()
  ): Promise<LeaveSummaryResponse> {
    const response = await axios.get<LeaveSummaryResponse>(
      `${API_BASE_URL}/api/leave-summary/summary/${userId}`,
      {
        params: { year },
        withCredentials: true, // For cookie-based auth
      }
    );
    return response.data;
  },
};
```

### 2. Edit History Component

```tsx
// components/LeaveSummaryEditHistory.tsx

import React from 'react';
import { EditHistoryEntry } from '../types/leave-summary';
import { format } from 'date-fns';

interface EditHistoryProps {
  editHistory: EditHistoryEntry[];
}

const EditHistory: React.FC<EditHistoryProps> = ({ editHistory }) => {
  if (!editHistory || editHistory.length === 0) {
    return (
      <div className="text-gray-500 text-sm italic">
        No edit history available
      </div>
    );
  }

  const getFieldLabel = (field: string): string => {
    const fieldMap: Record<string, string> = {
      'annual.alloted': 'Annual Leave',
      'sick.alloted': 'Sick Leave',
      'compOff.alloted': 'Comp Off',
      'otherPaid.alloted': 'Other Paid',
      'otherUnpaid.alloted': 'Other Unpaid',
      'maternity.alloted': 'Maternity Leave',
      'workFromHome.alloted': 'Work From Home',
      'restricted_holiday.alloted': 'Restricted Holiday',
    };
    return fieldMap[field] || field;
  };

  const formatDate = (dateString: string): string => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  return (
    <div className="mt-6">
      <h3 className="text-lg font-semibold mb-4">Edit History</h3>
      <div className="space-y-3">
        {editHistory.map((entry, index) => (
          <div
            key={index}
            className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">
                    {getFieldLabel(entry.field)}
                  </span>
                  <span className="text-sm text-gray-500">
                    edited by {entry.editedBy.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-red-600 line-through">
                    {entry.oldValue}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="text-green-600 font-semibold">
                    {entry.newValue}
                  </span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {formatDate(entry.editedAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EditHistory;
```

### 3. Enhanced Leave Summary Component

```tsx
// components/LeaveSummaryView.tsx

import React, { useState, useEffect } from 'react';
import { leaveSummaryService } from '../services/leaveSummaryService';
import { LeaveSummary } from '../types/leave-summary';
import EditHistory from './LeaveSummaryEditHistory';
import LoadingSpinner from './LoadingSpinner';

interface LeaveSummaryViewProps {
  userId: string;
  year?: number;
}

const LeaveSummaryView: React.FC<LeaveSummaryViewProps> = ({
  userId,
  year = new Date().getFullYear(),
}) => {
  const [summary, setSummary] = useState<LeaveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeaveSummary();
  }, [userId, year]);

  const loadLeaveSummary = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await leaveSummaryService.getLeaveSummary(userId, year);
      setSummary(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load leave summary');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    );
  }

  if (!summary) {
    return <div>No leave summary found</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold mb-6">
          Leave Summary - {summary.year}
        </h2>

        {/* Leave Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <LeaveCategoryCard
            title="Annual Leave"
            category={summary.annual}
          />
          <LeaveCategoryCard title="Sick Leave" category={summary.sick} />
          <LeaveCategoryCard title="Comp Off" category={summary.compOff} />
          <LeaveCategoryCard
            title="Other Paid"
            category={summary.otherPaid}
          />
          <LeaveCategoryCard
            title="Other Unpaid"
            category={summary.otherUnpaid}
          />
          <LeaveCategoryCard
            title="Maternity Leave"
            category={summary.maternity}
          />
          <LeaveCategoryCard
            title="Work From Home"
            category={summary.workFromHome}
          />
          <LeaveCategoryCard
            title="Restricted Holiday"
            category={summary.restricted_holiday}
          />
        </div>

        {/* Edit History */}
        <EditHistory editHistory={summary.editHistory} />
      </div>
    </div>
  );
};

interface LeaveCategoryCardProps {
  title: string;
  category: LeaveSummary['annual'];
}

const LeaveCategoryCard: React.FC<LeaveCategoryCardProps> = ({
  title,
  category,
}) => {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-gray-600">Allotted:</span>
          <span className="font-medium">{category.alloted}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Availed:</span>
          <span className="font-medium">{category.availed}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="text-gray-900 font-semibold">Remaining:</span>
          <span className="font-bold text-blue-600">{category.remaining}</span>
        </div>
      </div>
    </div>
  );
};

export default LeaveSummaryView;
```

### 4. Table View (Alternative)

```tsx
// components/EditHistoryTable.tsx

import React from 'react';
import { EditHistoryEntry } from '../types/leave-summary';
import { format } from 'date-fns';

interface EditHistoryTableProps {
  editHistory: EditHistoryEntry[];
}

const EditHistoryTable: React.FC<EditHistoryTableProps> = ({ editHistory }) => {
  const getFieldLabel = (field: string): string => {
    const fieldMap: Record<string, string> = {
      'annual.alloted': 'Annual Leave',
      'sick.alloted': 'Sick Leave',
      'compOff.alloted': 'Comp Off',
      'otherPaid.alloted': 'Other Paid',
      'otherUnpaid.alloted': 'Other Unpaid',
      'maternity.alloted': 'Maternity Leave',
      'workFromHome.alloted': 'Work From Home',
      'restricted_holiday.alloted': 'Restricted Holiday',
    };
    return fieldMap[field] || field;
  };

  if (!editHistory || editHistory.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No edit history available
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Date & Time
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Field
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Edited By
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Old Value
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              New Value
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Change
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {editHistory.map((entry, index) => {
            const change = entry.newValue - entry.oldValue;
            const changeColor = change > 0 ? 'text-green-600' : 'text-red-600';
            const changeSign = change > 0 ? '+' : '';

            return (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {format(new Date(entry.editedAt), 'MMM dd, yyyy HH:mm')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {getFieldLabel(entry.field)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {entry.editedBy.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {entry.oldValue}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {entry.newValue}
                </td>
                <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${changeColor}`}>
                  {changeSign}{change}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default EditHistoryTable;
```

---

## Vue.js Implementation

### 1. Component

```vue
<!-- components/LeaveSummaryEditHistory.vue -->

<template>
  <div class="edit-history">
    <h3 class="text-lg font-semibold mb-4">Edit History</h3>
    
    <div v-if="!editHistory || editHistory.length === 0" class="text-gray-500 text-sm italic">
      No edit history available
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="(entry, index) in editHistory"
        :key="index"
        class="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors"
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-2">
              <span class="font-medium text-gray-900">
                {{ getFieldLabel(entry.field) }}
              </span>
              <span class="text-sm text-gray-500">
                edited by {{ entry.editedBy.name }}
              </span>
            </div>
            <div class="flex items-center gap-3 text-sm">
              <span class="text-red-600 line-through">
                {{ entry.oldValue }}
              </span>
              <span class="text-gray-400">→</span>
              <span class="text-green-600 font-semibold">
                {{ entry.newValue }}
              </span>
            </div>
          </div>
          <div class="text-xs text-gray-500">
            {{ formatDate(entry.editedAt) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { format } from 'date-fns';
import type { EditHistoryEntry } from '../types/leave-summary';

interface Props {
  editHistory: EditHistoryEntry[];
}

const props = defineProps<Props>();

const fieldMap: Record<string, string> = {
  'annual.alloted': 'Annual Leave',
  'sick.alloted': 'Sick Leave',
  'compOff.alloted': 'Comp Off',
  'otherPaid.alloted': 'Other Paid',
  'otherUnpaid.alloted': 'Other Unpaid',
  'maternity.alloted': 'Maternity Leave',
  'workFromHome.alloted': 'Work From Home',
  'restricted_holiday.alloted': 'Restricted Holiday',
};

const getFieldLabel = (field: string): string => {
  return fieldMap[field] || field;
};

const formatDate = (dateString: string): string => {
  try {
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  } catch {
    return dateString;
  }
};
</script>
```

---

## Svelte Implementation

```svelte
<!-- components/LeaveSummaryEditHistory.svelte -->

<script lang="ts">
  import { format } from 'date-fns';
  import type { EditHistoryEntry } from '../types/leave-summary';

  export let editHistory: EditHistoryEntry[] = [];

  const fieldMap: Record<string, string> = {
    'annual.alloted': 'Annual Leave',
    'sick.alloted': 'Sick Leave',
    'compOff.alloted': 'Comp Off',
    'otherPaid.alloted': 'Other Paid',
    'otherUnpaid.alloted': 'Other Unpaid',
    'maternity.alloted': 'Maternity Leave',
    'workFromHome.alloted': 'Work From Home',
    'restricted_holiday.alloted': 'Restricted Holiday',
  };

  function getFieldLabel(field: string): string {
    return fieldMap[field] || field;
  }

  function formatDate(dateString: string): string {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  }
</script>

<div class="mt-6">
  <h3 class="text-lg font-semibold mb-4">Edit History</h3>
  
  {#if !editHistory || editHistory.length === 0}
    <div class="text-gray-500 text-sm italic">
      No edit history available
    </div>
  {:else}
    <div class="space-y-3">
      {#each editHistory as entry, index}
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-2">
                <span class="font-medium text-gray-900">
                  {getFieldLabel(entry.field)}
                </span>
                <span class="text-sm text-gray-500">
                  edited by {entry.editedBy.name}
                </span>
              </div>
              <div class="flex items-center gap-3 text-sm">
                <span class="text-red-600 line-through">
                  {entry.oldValue}
                </span>
                <span class="text-gray-400">→</span>
                <span class="text-green-600 font-semibold">
                  {entry.newValue}
                </span>
              </div>
            </div>
            <div class="text-xs text-gray-500">
              {formatDate(entry.editedAt)}
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

---

## Complete Example: Getting and Displaying Values

### React Example - Full Implementation

```tsx
import React, { useState, useEffect } from 'react';

interface EditHistoryEntry {
  editedBy: { id: string; name: string };
  field: string;
  oldValue: number;
  newValue: number;
  editedAt: string;
}

function LeaveSummaryEditHistory() {
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEditHistory();
  }, []);

  const fetchEditHistory = async () => {
    try {
      const response = await fetch(
        '/api/leave-summary/summary/69735bcc77ea11ab2d790594?year=2026'
      );
      const data = await response.json();
      
      // GET THE EDIT HISTORY VALUES
      const history = data.data.editHistory || [];
      setEditHistory(history);
    } catch (error) {
      console.error('Error fetching edit history:', error);
    } finally {
      setLoading(false);
    }
  };

  // Map field names to display labels
  const getFieldLabel = (field: string): string => {
    const fieldMap: Record<string, string> = {
      'annual.alloted': 'Annual Leave',
      'sick.alloted': 'Sick Leave',
      'compOff.alloted': 'Comp Off',
      'lossOfPay.alloted': 'Loss of Pay',
      'otherPaid.alloted': 'Other Paid',
      'otherUnpaid.alloted': 'Other Unpaid',
      'maternity.alloted': 'Maternity Leave',
      'workFromHome.alloted': 'Work From Home',
      'restricted_holiday.alloted': 'Restricted Holiday',
    };
    return fieldMap[field] || field;
  };

  // Format date
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  // Calculate change
  const getChange = (oldValue: number, newValue: number): string => {
    const change = newValue - oldValue;
    return change > 0 ? `+${change}` : `${change}`;
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Edit History</h2>
      {editHistory.length === 0 ? (
        <p>No edit history</p>
      ) : (
        <div>
          {editHistory.map((entry, index) => (
            <div key={index} className="edit-entry">
              {/* ACCESS ALL FIELDS */}
              <p><strong>Field:</strong> {getFieldLabel(entry.field)}</p>
              <p><strong>Edited By:</strong> {entry.editedBy.name}</p>
              <p><strong>Old Value:</strong> {entry.oldValue}</p>
              <p><strong>New Value:</strong> {entry.newValue}</p>
              <p><strong>Change:</strong> {getChange(entry.oldValue, entry.newValue)}</p>
              <p><strong>Date:</strong> {formatDate(entry.editedAt)}</p>
              <hr />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default LeaveSummaryEditHistory;
```

### JavaScript/Vanilla JS Example

```javascript
// Get API response
async function getEditHistory(userId, year) {
  const response = await fetch(
    `/api/leave-summary/summary/${userId}?year=${year}`
  );
  const data = await response.json();
  
  // GET THE EDIT HISTORY ARRAY
  const editHistory = data.data.editHistory;
  
  // Loop through each entry
  editHistory.forEach((entry, index) => {
    // ACCESS EACH FIELD
    console.log('Entry', index + 1);
    console.log('Editor ID:', entry.editedBy.id);
    console.log('Editor Name:', entry.editedBy.name);
    console.log('Field:', entry.field);
    console.log('Old Value:', entry.oldValue);
    console.log('New Value:', entry.newValue);
    console.log('Date:', entry.editedAt);
    console.log('---');
  });
  
  return editHistory;
}

// Usage
getEditHistory('69735bcc77ea11ab2d790594', 2026);
```

### Vue.js Example - Getting Values

```vue
<template>
  <div>
    <h2>Edit History</h2>
    <div v-for="(entry, index) in editHistory" :key="index">
      <!-- ACCESS ALL FIELDS -->
      <p><strong>Field:</strong> {{ getFieldLabel(entry.field) }}</p>
      <p><strong>Editor:</strong> {{ entry.editedBy.name }}</p>
      <p><strong>Old:</strong> {{ entry.oldValue }}</p>
      <p><strong>New:</strong> {{ entry.newValue }}</p>
      <p><strong>Date:</strong> {{ formatDate(entry.editedAt) }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const editHistory = ref([]);

onMounted(async () => {
  // GET THE VALUES FROM API
  const response = await fetch('/api/leave-summary/summary/69735bcc77ea11ab2d790594?year=2026');
  const data = await response.json();
  
  // ACCESS editHistory FIELD
  editHistory.value = data.data.editHistory || [];
});

const getFieldLabel = (field) => {
  const fieldMap = {
    'annual.alloted': 'Annual Leave',
    'sick.alloted': 'Sick Leave',
    // ... other mappings
  };
  return fieldMap[field] || field;
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleString();
};
</script>
```

## Usage Examples

### React Example

```tsx
import React from 'react';
import LeaveSummaryView from './components/LeaveSummaryView';

function App() {
  return (
    <div>
      <LeaveSummaryView userId="69735bcc77ea11ab2d790594" year={2026} />
    </div>
  );
}
```

### Accessing Values - Quick Reference

```typescript
// After API call
const response = await api.getLeaveSummary(userId, year);
const summary = response.data;

// GET editHistory array
const editHistory = summary.editHistory; // Array

// GET first entry
const firstEntry = editHistory[0];

// GET all field values from entry
const editorId = firstEntry.editedBy.id;        // String
const editorName = firstEntry.editedBy.name;     // String  
const field = firstEntry.field;                  // String: "annual.alloted"
const oldValue = firstEntry.oldValue;            // Number: 4
const newValue = firstEntry.newValue;            // Number: 3
const editedAt = firstEntry.editedAt;            // String: ISO date

// GET all entries for specific field
const annualEdits = editHistory.filter(
  (entry) => entry.field === 'annual.alloted'
);

// GET all entries by specific editor
const adminEdits = editHistory.filter(
  (entry) => entry.editedBy.name === 'Admin User'
);

// GET latest edit (most recent)
const latestEdit = editHistory.sort(
  (a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime()
)[0];
```

### Filter by Field

```tsx
// Filter edit history by specific field
const annualEdits = summary.editHistory.filter(
  (entry) => entry.field === 'annual.alloted'
);
```

### Sort by Date

```tsx
// Sort by most recent first
const sortedHistory = [...summary.editHistory].sort(
  (a, b) => new Date(b.editedAt).getTime() - new Date(a.editedAt).getTime()
);
```

### Group by Editor

```tsx
// Group edits by editor
const editsByEditor = summary.editHistory.reduce((acc, entry) => {
  const editorName = entry.editedBy.name;
  if (!acc[editorName]) {
    acc[editorName] = [];
  }
  acc[editorName].push(entry);
  return acc;
}, {} as Record<string, EditHistoryEntry[]>);
```

---

## Styling Options

### Tailwind CSS (Used in examples above)
- Responsive design
- Hover effects
- Color coding for old/new values

### Material-UI

```tsx
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

// Use Material-UI Table component
```

### Ant Design

```tsx
import { Table } from 'antd';

// Use Ant Design Table component
```

---

## Key Features to Implement

1. ✅ Display edit history in chronological order
2. ✅ Show field name, editor name, old/new values
3. ✅ Format dates in user-friendly format
4. ✅ Highlight changes (red for decrease, green for increase)
5. ✅ Handle empty edit history gracefully
6. ✅ Make it responsive for mobile devices
7. ✅ Add filtering/sorting options (optional)
8. ✅ Add pagination for large histories (optional)

---

## Testing

```typescript
// Example test
describe('EditHistory Component', () => {
  it('displays edit history correctly', () => {
    const editHistory: EditHistoryEntry[] = [
      {
        editedBy: { id: '123', name: 'Admin' },
        field: 'annual.alloted',
        oldValue: 4,
        newValue: 3,
        editedAt: '2026-01-28T10:30:00.000Z',
      },
    ];

    render(<EditHistory editHistory={editHistory} />);
    expect(screen.getByText('Annual Leave')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
```

---

## Testing Edit History

### Example: Update Annual Leave from 6 to 4

**Request:**
```http
POST /api/leave-summary/allotments
Content-Type: application/json

{
  "userId": "69735c5b29772c29e1fd18b0",
  "year": 2026,
  "annual": 4
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "69735c5b29772c29e1fd18b0",
    "year": 2026,
    "annual": {
      "alloted": 4,
      "availed": 0,
      "remaining": 4
    },
    "editHistory": [
      {
        "editedBy": {
          "id": "69735bcc77ea11ab2d790594",
          "name": "Admin User"
        },
        "field": "annual.alloted",
        "oldValue": 6,
        "newValue": 4,
        "editedAt": "2026-01-28T10:30:00.000Z"
      }
    ]
  }
}
```

### Example: Update Annual Leave from 4 to 6

**Request:**
```http
POST /api/leave-summary/allotments
Content-Type: application/json

{
  "userId": "69735c5b29772c29e1fd18b0",
  "year": 2026,
  "annual": 6
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "69735c5b29772c29e1fd18b0",
    "year": 2026,
    "annual": {
      "alloted": 6,
      "availed": 0,
      "remaining": 6
    },
    "editHistory": [
      {
        "editedBy": {
          "id": "69735bcc77ea11ab2d790594",
          "name": "Admin User"
        },
        "field": "annual.alloted",
        "oldValue": 6,
        "newValue": 4,
        "editedAt": "2026-01-28T10:30:00.000Z"
      },
      {
        "editedBy": {
          "id": "69735bcc77ea11ab2d790594",
          "name": "Admin User"
        },
        "field": "annual.alloted",
        "oldValue": 4,
        "newValue": 6,
        "editedAt": "2026-01-28T10:35:00.000Z"
      }
    ]
  }
}
```

### Frontend Test Code

```typescript
// Test updating annual leave
async function testEditHistory() {
  const userId = "69735c5b29772c29e1fd18b0";
  const year = 2026;

  // Step 1: Get current summary
  const current = await fetch(
    `/api/leave-summary/summary/${userId}?year=${year}`
  );
  const currentData = await current.json();
  console.log('Current annual:', currentData.data.annual.alloted);
  console.log('Current editHistory:', currentData.data.editHistory);

  // Step 2: Update annual leave from 6 to 4
  const updateResponse = await fetch('/api/leave-summary/allotments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      year,
      annual: 4  // Change from 6 to 4
    })
  });
  const updateData = await updateResponse.json();
  console.log('After update - annual:', updateData.data.annual.alloted);
  console.log('After update - editHistory:', updateData.data.editHistory);
  // Should show: [{ field: "annual.alloted", oldValue: 6, newValue: 4, ... }]

  // Step 3: Update again from 4 to 6
  const updateResponse2 = await fetch('/api/leave-summary/allotments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      year,
      annual: 6  // Change from 4 to 6
    })
  });
  const updateData2 = await updateResponse2.json();
  console.log('After second update - annual:', updateData2.data.annual.alloted);
  console.log('After second update - editHistory:', updateData2.data.editHistory);
  // Should show 2 entries in editHistory array
}
```

## Notes

- Edit history is only tracked for manual edits via `updateLeaveAllotments()`
- Automatic system updates (leave approvals, etc.) are NOT tracked
- Edit history is appended, never overwritten
- The field format is `{category}.alloted` (e.g., "annual.alloted")
- All dates are in ISO 8601 format (UTC)
- **IMPORTANT**: Edit history is now included in both GET and POST responses
