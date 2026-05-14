import { Container } from '../container';
import { RequestContext } from '../types/context';

/**
 * Utility to trigger automated milestones via the CommunicationService.
 * This can be safely called from cron jobs.
 */
export const processDailyMilestones = async () => {
    const requestId = 'CRON-' + Date.now();
    // Create a system-level mock context for the service
    const mockContext: RequestContext = {
        requestId,
        reqRole: 'ADMIN'
    };

    const container = Container.getInstance().createScope(requestId, mockContext);
    
    try {
        console.log('[MilestoneCron] Executing daily engine...');
        const stats = await container.communicationService.processDailyMilestones();
        console.log(`[MilestoneCron] Finished: ${stats.birthdays} birthdays, ${stats.anniversaries} anniversaries.`);
    } catch (err) {
        console.error('[MilestoneCron] Error:', err);
    } finally {
        Container.getInstance().clearScope(requestId);
    }
};
