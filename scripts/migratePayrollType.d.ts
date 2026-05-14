/**
 * Migration Utility: Updates the 'type' field for all existing payroll records.
 * if isFinalSettlement is true => type = 'FinalSettlement'
 * else => type = 'Regular'
 */
export declare function migratePayrollType(): Promise<void>;
