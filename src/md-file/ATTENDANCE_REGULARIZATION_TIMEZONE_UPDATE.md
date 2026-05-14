# Attendance Regularization Service - Timezone Update

## Overview
Updated the `attendance-regularization.service.ts` to dynamically determine timezone conversion based on the user's country instead of hardcoding IST (UTC+5:30) conversion.

## Problem
The service was hardcoding IST timezone conversion (UTC+5:30) for all users, regardless of their actual location. This caused incorrect time conversions for UAE users (UTC+4:00).

## Solution
- **Dynamic Timezone Detection**: Fetch user's country from the user model
- **Country-Based Conversion**: Use different timezone offsets based on user's country
- **Centralized Logic**: Created utility methods for timezone offset calculation

## Changes Made

### 1. Added Timezone Utility Methods
```typescript
/**
 * Get timezone offset in hours based on user's country
 * @param country - User's country code ('IN' | 'AE')
 * @returns Timezone offset in hours
 */
private getTimezoneOffsetHours(country: string): number {
    switch (country) {
        case 'IN': return 5.5; // IST (UTC+5:30)
        case 'AE': return 4;   // UAE (UTC+4:00)
        default: return 5.5;   // Default to IST for backward compatibility
    }
}

/**
 * Get timezone offset in hours and minutes based on user's country
 * @param country - User's country code ('IN' | 'AE')
 * @returns Object with hours and minutes offset
 */
private getTimezoneOffset(country: string): { hours: number; minutes: number } {
    switch (country) {
        case 'IN': return { hours: 5, minutes: 30 }; // IST (UTC+5:30)
        case 'AE': return { hours: 4, minutes: 0 };  // UAE (UTC+4:00)
        default: return { hours: 5, minutes: 30 };   // Default to IST for backward compatibility
    }
}
```

### 2. Updated `createBulkRegularization` Method
- **User Lookup**: Fetch user's country from database
- **Dynamic Conversion**: Use user's country for timezone conversion
- **Logging**: Added debug logs for timezone offset

```typescript
// Get user details to determine timezone based on country
const user = await User.findById(userId).select('country').lean();
if (!user) {
    throw new Error('User not found');
}

const timezoneOffset = this.getTimezoneOffsetHours(user.country);
console.log(`User country: ${user.country}, Timezone offset: UTC${timezoneOffset >= 0 ? '+' : ''}${timezoneOffset}`);

// Convert fromTime and toTime from local timezone to UTC
const parseLocalTime = (timeStr: string, baseDate: Date): Date => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const localDate = new Date(baseDate);
    localDate.setHours(hours, minutes, 0, 0);
    // Convert local time to UTC based on user's country
    return new Date(localDate.getTime() - timezoneOffset * 60 * 60 * 1000);
};
```

### 3. Updated `getShiftTimings` Method
- **Parameter Addition**: Added `userCountry` parameter
- **Dynamic Conversion**: Use country-based timezone offset
- **Backward Compatibility**: Default to 'IN' if no country provided

```typescript
private getShiftTimings(shift: IShift & Document, shiftDay: Date, userCountry: string = 'IN'): IShiftWindow {
    const timezoneOffset = this.getTimezoneOffset(userCountry);
    console.log(`Converting shift times for country: ${userCountry}, Timezone offset: UTC+${timezoneOffset.hours}:${timezoneOffset.minutes.toString().padStart(2, '0')}`);
    
    const convertLocalToUTC = (localHours: number, localMinutes: number): { hours: number; minutes: number } => {
        let utcHours = localHours - timezoneOffset.hours;
        let utcMinutes = localMinutes - timezoneOffset.minutes;
        // ... handle overflow logic
    };
}
```

### 4. Updated Time Formatting
- **New Method**: `formatTimeLocal(date, userCountry)` for dynamic timezone formatting
- **Backward Compatibility**: Kept `formatTimeIST()` method for existing code
- **Email Updates**: Use user's country for email time formatting

```typescript
private formatTimeLocal(date: Date, userCountry: string = 'IN'): string {
    const timezoneOffset = this.getTimezoneOffsetHours(userCountry);
    const localTime = new Date(date.getTime() + timezoneOffset * 60 * 60 * 1000);
    return localTime.toTimeString().slice(0, 5); // "HH:mm"
}

// Keep the old method for backward compatibility
private formatTimeIST(date: Date): string {
    return this.formatTimeLocal(date, 'IN');
}
```

## Timezone Mappings

| Country Code | Country | Timezone | UTC Offset |
|--------------|---------|----------|------------|
| `IN` | India | IST | UTC+5:30 |
| `AE` | UAE | UAE Standard Time | UTC+4:00 |

## Example Conversions

### India (IN) - UTC+5:30
- **Local Time**: 9:00 AM
- **UTC Time**: 3:30 AM (previous day)
- **Conversion**: 9:00 - 5:30 = 3:30

### UAE (AE) - UTC+4:00
- **Local Time**: 9:00 AM
- **UTC Time**: 5:00 AM
- **Conversion**: 9:00 - 4:00 = 5:00

## Benefits

1. **Accurate Time Conversion**: Times are now converted correctly based on user's actual location
2. **Multi-Country Support**: Supports both India and UAE timezones
3. **Extensible**: Easy to add more countries in the future
4. **Backward Compatible**: Existing code continues to work
5. **Consistent**: Uses the same logic as bulk attendance upload service

## Testing

Verified the conversion logic with test cases:
- ✅ IN (India): 9:00 AM local → 3:30 AM UTC
- ✅ AE (UAE): 9:00 AM local → 5:00 AM UTC
- ✅ Round-trip conversion: UTC → Local → UTC
- ✅ Same UTC time displayed correctly in different timezones

## Migration Notes

- **No Breaking Changes**: Existing functionality remains unchanged
- **Default Behavior**: Falls back to IST (UTC+5:30) for unknown countries
- **Database**: No schema changes required
- **API**: No interface changes required

## Future Enhancements

1. **More Countries**: Add support for additional countries/timezones
2. **Daylight Saving**: Handle DST transitions
3. **User Preferences**: Allow users to override their timezone
4. **API Endpoint**: Expose timezone conversion utilities 