// cron.ts
import cron from 'node-cron';
import { updateShiftAssignmentStatuses } from './updateShiftAssignmentStatuses';
import { processDailyMilestones } from './processMilestones';

cron.schedule('59 23 * * *', async () => {
    try {
        console.log('[CRON] Running shift assignment status updater...');
        await updateShiftAssignmentStatuses();
        console.log('[CRON] Done');
    } catch (err) {
        console.error('[CRON] Error updating shift assignments', err);
    }
});

// Daily Automated Greetings at 12:00 AM IST (18:30 UTC)
// Daily Automated Greetings at 12:00 AM IST (18:30 UTC)
cron.schedule('30 18 * * *', async () => {
    try {
        console.log('[CRON] Running daily milestone greetings...');
        await processDailyMilestones();
        console.log('[CRON] Milestones processed.');
    } catch (err) {
        console.error('[CRON] Error in milestone cron', err);
    }
});