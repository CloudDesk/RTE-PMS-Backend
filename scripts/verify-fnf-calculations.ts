
/**
 * Standalone verification script for Final Settlement Logic
 * Run this to verify "Actual Month Days" calculation across various scenarios.
 * 
 * Usage: npx ts-node scripts/test-fnf-calculations.ts
 */

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

function calculateNoticeRecovery(
    leavingDateStr: string,
    shortfallDays: number,
    monthlyGross: number
) {
    let recoveryForLog = 0;
    const breakdown = [];

    // Start from day AFTER leaving
    let currentDate = new Date(leavingDateStr);
    currentDate.setDate(currentDate.getDate() + 1);

    for (let i = 0; i < shortfallDays; i++) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const dailyRate = monthlyGross / daysInMonth;
        recoveryForLog += dailyRate;

        breakdown.push({
            date: currentDate.toISOString().split('T')[0],
            monthDays: daysInMonth,
            rate: dailyRate.toFixed(2),
        });

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return { total: Math.round(recoveryForLog), breakdown };
}

function runScenario(name: string, leavingDate: string, shortfall: number, gross: number) {
    console.log(`\n--- SCENARIO: ${name} ---`);
    console.log(`Leaving: ${leavingDate}, Shortfall: ${shortfall} days, Gross: ${gross}`);
    const result = calculateNoticeRecovery(leavingDate, shortfall, gross);

    // Group breakdown by month for clarity
    const monthMap: Record<string, { days: number, expectedRate: number, total: number }> = {};

    result.breakdown.forEach(d => {
        const m = new Date(d.date).toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!monthMap[m]) monthMap[m] = { days: 0, expectedRate: parseFloat(d.rate), total: 0 };
        monthMap[m].days++;
        monthMap[m].total += parseFloat(d.rate);
    });

    Object.entries(monthMap).forEach(([month, data]) => {
        console.log(`  ${month}: ${data.days} days @ ~${data.expectedRate}/day = ${Math.round(data.total)}`);
    });

    console.log(`  TOTAL RECOVERY: ₹${result.total}`);
}

// === RUN TEST CASES ===

const GROSS = 30000;

// 1. User's Example (Feb/Mar split)
// Resign Feb 12. Notice 60. Leave Feb 12. Shortfall 60.
// Recovery starts Feb 13.
runScenario("USER EXAMPLE (Feb/Mar)", "2024-02-12", 60, 40000);
// Note: User example had 40k gross. 2024 is leap year (29 days). User example assumed 28 days for Feb? 
// Let's stick to 2023 for non-leap or 2024 for leap. 
// User example: "Feb (28 days)". So non-leap. Let's use 2023.
runScenario("USER EXAMPLE (Feb 2023 - Non Leap)", "2023-02-12", 60, 40000);

// 2. Standard 30 Day Month (April)
runScenario("Standard April (30 days)", "2023-04-01", 10, 30000);

// 3. Standard 31 Day Month (May)
runScenario("Standard May (31 days)", "2023-05-01", 10, 30000);

// 4. Leap Year Feb
runScenario("Leap Year Feb 2024", "2024-02-01", 10, 30000);

// 5. Cross Year (Dec to Jan)
runScenario("Cross Year (Dec 25 - Jan)", "2023-12-25", 15, 30000);

