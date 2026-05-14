export const DEFAULT_SHIFT_EARLY_CHECK_IN_THRESHOLD = 120; // minutes
export const DEFAULT_DUPLICATE_SWIPE_THRESHOLD = 2; // minutes
export const DEFAULT_GRACE_PERIOD = 15; // minutes

export const ATTENDANCE_STATUS = {
  INCOMPLETE: 'incomplete',
  COMPLETE: 'complete',
  DUPLICATE_SWIPES: 'duplicate_swipes',
  MISSING_CHECKOUT: 'missing_checkout',
} as const;

export const SWIPE_TYPE = {
  CHECK_IN: 'check-in',
  SWIPE: 'swipe',
} as const; 