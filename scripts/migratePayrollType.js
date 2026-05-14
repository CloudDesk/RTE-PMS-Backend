"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migratePayrollType = migratePayrollType;
const payrolls_model_1 = require("../src/models/payrolls.model");
/**
 * Migration Utility: Updates the 'type' field for all existing payroll records.
 * if isFinalSettlement is true => type = 'FinalSettlement'
 * else => type = 'Regular'
 */
async function migratePayrollType() {
    try {
        console.log('Starting Payroll Type migration...');
        //get
        const fnfQuery = { isFinalSettlement: true };
        const regularQuery = { isFinalSettlement: { $ne: true } };
        const fnfCount = await payrolls_model_1.Payroll.countDocuments(fnfQuery);
        const regularCount = await payrolls_model_1.Payroll.countDocuments(regularQuery);
        console.log(`Found ${fnfCount} FnF records and ${regularCount} Regular records.`);
        // -------
        //update
        // 1. Update Final Settlement records
        const fnfResult = await payrolls_model_1.Payroll.updateMany(fnfQuery, { $set: { type: 'FinalSettlement' } });
        // 2. Update Regular records
        const regularResult = await payrolls_model_1.Payroll.updateMany(regularQuery, { $set: { type: 'Regular' } });
        const totalUpdated = fnfResult.modifiedCount + regularResult.modifiedCount;
        console.log(`Payroll Type migration complete. Records processed: ${totalUpdated}`);
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
}
//# sourceMappingURL=migratePayrollType.js.map