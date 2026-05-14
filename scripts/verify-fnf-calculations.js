
/**
 * Standalone verification script for Final Settlement Logic (Start Date = leavingDate + 1)
 */

function calculateNoticeRecovery(leavingDateStr, shortfallDays, monthlyGross) {
    let recoveryForLog = 0;
    const breakdown = [];
    
    // Start from day AFTER leaving
    // Example: Leave Feb 12. Recovery starts Feb 13.
    let currentDate = new Date(leavingDateStr);
    currentDate.setDate(currentDate.getDate() + 1);

    for (let i = 0; i < shortfallDays; i++) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth(); // 0 = Jan
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

function runScenario(name, leavingDate, shortfall, gross) {
    console.log(`\n==================================================`);
    console.log(`SCENARIO: ${name}`);
    console.log(`Leaving: ${leavingDate} | Shortfall: ${shortfall} days | Gross: ₹${gross}`);
    console.log(`--------------------------------------------------`);
    const result = calculateNoticeRecovery(leavingDate, shortfall, gross);
    
    // Group breakdown by month
    const monthMap = {};
    
    result.breakdown.forEach(d => {
        const m = new Date(d.date).toLocaleString('default', { month: 'short', year: 'numeric' });
        if (!monthMap[m]) monthMap[m] = { days: 0, expectedRate: parseFloat(d.rate), total: 0 };
        monthMap[m].days++;
        monthMap[m].total += parseFloat(d.rate);
    });

    Object.entries(monthMap).forEach(([month, data]) => {
        // Rounding the rate for display if it varies within month (it shouldn't)
        console.log(`  ${month}: ${data.days} days \t (Rate: ~₹${Math.round(data.expectedRate)}) \t = ₹${Math.round(data.total)}`);
    });
    
    console.log(`--------------------------------------------------`);
    console.log(`  TOTAL RECOVERY: ₹${result.total}`);
    console.log(`==================================================\n`);
}

// === RUN TEST CASES ===

// 1. User's specific Request: Feb 12 Resignation, 60 days shortfall (Feb 13 start)
runScenario("USER REQUEST (Feb/Mar/Apr 2024 - Leap Year)", "2024-02-12", 60, 40000);
// Logic: 
// Feb 2024 (29 days): Feb 13-29 = 17 days. Rate = 40000/29 = 1379.31 => 23448
// Mar 2024 (31 days): Mar 1-31 = 31 days. Rate = 40000/31 = 1290.32 => 40000
// Apr 2024 (30 days): Apr 1-12 = 12 days. Rate = 40000/30 = 1333.33 => 16000
// Total: 23448 + 40000 + 16000 = 79448 approx.

// 2. User's specific Request but Non-Leap Year (2023)
runScenario("USER REQUEST (Feb/Mar/Apr 2023 - Non-Leap)", "2023-02-12", 60, 40000);
// Logic:
// Feb (28 days): Feb 13-28 = 16 days. Rate = 40000/28 = 1428.57 => 22857
// Mar (31 days): Mar 1-31 = 31 days. Rate = 40000/31 = 1290.32 => 40000
// Apr (30 days): Apr 1-13 = 13 days. Rate = 40000/30 = 1333.33 => 17333
// Total: 22857 + 40000 + 17333 = 80190 approx. (THIS MATCHES USER CALCULATION)

// 3. Shortfall entirely in 30-day month
runScenario("Standard April (30 days)", "2023-04-01", 10, 30000);

// 4. Shortfall entirely in 31-day month
runScenario("Standard May (31 days)", "2023-05-01", 10, 30000);

// 5. Shortfall entirely in 28-day month (Feb)
runScenario("Standard Feb (28 days)", "2023-02-01", 10, 30000);

// 6. Cross Year (Dec to Jan)
runScenario("Cross Year (Dec 25 - Jan)", "2023-12-25", 15, 30000);
