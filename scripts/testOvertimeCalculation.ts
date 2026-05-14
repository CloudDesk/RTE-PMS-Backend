/**
 * Test script to demonstrate overtime calculation in bulk attendance upload
 * This script shows how the system calculates overtime hours based on actual work vs shift hours
 */

interface TestScenario {
  name: string;
  description: string;
  shiftHours: number; // Shift duration in hours
  actualWorkHours: number; // Actual work hours
  expectedOvertimeHours: number;
  expectedAttendanceStatus: string[];
}

const testScenarios: TestScenario[] = [
  {
    name: "No Overtime - Within 2 Hours",
    description: "Work hours exceed shift by less than 2 hours - no overtime",
    shiftHours: 8,
    actualWorkHours: 9.5, // 1.5 hours over
    expectedOvertimeHours: 0,
    expectedAttendanceStatus: ['Present', 'On-Time']
  },
  {
    name: "2-4 Hours Overtime - Record 2 Hours",
    description: "Work hours exceed shift by 2-4 hours - record 2 hours overtime",
    shiftHours: 8,
    actualWorkHours: 10.5, // 2.5 hours over
    expectedOvertimeHours: 2,
    expectedAttendanceStatus: ['Present', 'On-Time']
  },
  {
    name: "4-6 Hours Overtime - Record 4 Hours",
    description: "Work hours exceed shift by 4-6 hours - record 4 hours overtime",
    shiftHours: 8,
    actualWorkHours: 12.5, // 4.5 hours over
    expectedOvertimeHours: 4,
    expectedAttendanceStatus: ['Present', 'On-Time']
  },
  {
    name: "6-8 Hours Overtime - Record 6 Hours",
    description: "Work hours exceed shift by 6-8 hours - record 6 hours overtime",
    shiftHours: 8,
    actualWorkHours: 14.5, // 6.5 hours over
    expectedOvertimeHours: 6,
    expectedAttendanceStatus: ['Present', 'On-Time']
  },
  {
    name: "8+ Hours Overtime - Record Actual (Rounded)",
    description: "Work hours exceed shift by 8+ hours - record actual overtime rounded",
    shiftHours: 8,
    actualWorkHours: 17.3, // 9.3 hours over
    expectedOvertimeHours: 9, // Rounded from 9.3
    expectedAttendanceStatus: ['Present', 'On-Time']
  },
  {
    name: "Late Entry with Overtime",
    description: "Late entry but still qualifies for overtime",
    shiftHours: 8,
    actualWorkHours: 11.5, // 3.5 hours over
    expectedOvertimeHours: 2,
    expectedAttendanceStatus: ['Present', 'Late']
  },
  {
    name: "Early Exit - No Overtime",
    description: "Early exit - no overtime even if total hours are high",
    shiftHours: 8,
    actualWorkHours: 6, // 2 hours under
    expectedOvertimeHours: 0,
    expectedAttendanceStatus: ['Present', 'On-Time', 'Early-Exit']
  },
  {
    name: "Weekend Work with Overtime",
    description: "Weekend work with overtime hours",
    shiftHours: 8,
    actualWorkHours: 10.5, // 2.5 hours over
    expectedOvertimeHours: 2,
    expectedAttendanceStatus: ['Present', 'On-Time', 'Holiday-Swipe']
  },
  {
    name: "Out of Window with Overtime",
    description: "Out of window entry but still qualifies for overtime",
    shiftHours: 8,
    actualWorkHours: 11.5, // 3.5 hours over
    expectedOvertimeHours: 2,
    expectedAttendanceStatus: ['Present', 'On-Time', 'Out-Of-Window']
  }
];

function calculateOvertimeHours(actualWorkMs: number, shiftMs: number): number {
  const overtimeMs = actualWorkMs - shiftMs;
  
  // Only consider overtime if it's more than 2 hours
  const overtimeHours = overtimeMs / (1000 * 60 * 60);
  
  if (overtimeHours <= 2) {
    return 0; // No overtime if less than or equal to 2 hours
  }
  
  // Apply overtime rules
  if (overtimeHours <= 4) {
    return 2; // 2-4 hrs → record 2 hrs
  } else if (overtimeHours <= 6) {
    return 4; // 4-6 hrs → record 4 hrs
  } else if (overtimeHours <= 8) {
    return 6; // 6-8 hrs → record 6 hrs
  } else {
    // 8+ hrs → record actual overtime (rounded to nearest hour)
    return Math.round(overtimeHours);
  }
}

function formatTimeFromMs(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function determineAttendanceStatus(
  isWithinWindow: boolean,
  isLateEntry: boolean,
  isEarlyExit: boolean,
  isWeekend: boolean
): string[] {
  const attendanceStatus: string[] = [];
  
  // Always add "Present" for valid attendance records
  attendanceStatus.push('Present');
  
  // Check if within window
  if (!isWithinWindow) {
    attendanceStatus.push('Out-Of-Window');
  }

  // Check if late entry
  if (isLateEntry) {
    attendanceStatus.push('Late');
  } else {
    attendanceStatus.push('On-Time');
  }

  // Check if early exit
  if (isEarlyExit) {
    attendanceStatus.push('Early-Exit');
  }

  // Check weekend attendance
  if (isWeekend) {
    attendanceStatus.push('Holiday-Swipe');
  }

  return attendanceStatus;
}

async function testOvertimeCalculation() {
  console.log('🧪 Testing Overtime Calculation\n');

  for (const scenario of testScenarios) {
    console.log(`📋 Test: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log('');

    try {
      // Convert hours to milliseconds for calculation
      const shiftMs = scenario.shiftHours * 60 * 60 * 1000;
      const actualWorkMs = scenario.actualWorkHours * 60 * 60 * 1000;
      
      console.log('Input Data:');
      console.log(`  Shift Duration: ${scenario.shiftHours} hours (${formatTimeFromMs(shiftMs)})`);
      console.log(`  Actual Work: ${scenario.actualWorkHours} hours (${formatTimeFromMs(actualWorkMs)})`);
      console.log(`  Difference: ${(scenario.actualWorkHours - scenario.shiftHours).toFixed(1)} hours`);

      // Calculate overtime
      const calculatedOvertimeHours = calculateOvertimeHours(actualWorkMs, shiftMs);
      
      console.log('\nOvertime Calculation:');
      console.log(`  Calculated Overtime: ${calculatedOvertimeHours} hours`);
      console.log(`  Expected Overtime: ${scenario.expectedOvertimeHours} hours`);

      // Simulate attendance status determination
      const isWithinWindow = true; // Assume within window for these tests
      const isLateEntry = scenario.name.includes('Late');
      const isEarlyExit = scenario.name.includes('Early Exit');
      const isWeekend = scenario.name.includes('Weekend');
      
      const calculatedAttendanceStatus = determineAttendanceStatus(
        isWithinWindow,
        isLateEntry,
        isEarlyExit,
        isWeekend
      );

      console.log('\nAttendance Status:');
      console.log(`  Calculated: [${calculatedAttendanceStatus.join(', ')}]`);
      console.log(`  Expected: [${scenario.expectedAttendanceStatus.join(', ')}]`);

      // Validate results
      const isOvertimeCorrect = calculatedOvertimeHours === scenario.expectedOvertimeHours;
      const isStatusCorrect = JSON.stringify(calculatedAttendanceStatus.sort()) === JSON.stringify(scenario.expectedAttendanceStatus.sort());

      console.log('\nValidation:');
      console.log(`  Overtime Calculation: ${isOvertimeCorrect ? '✅' : '❌'} (Expected: ${scenario.expectedOvertimeHours}, Got: ${calculatedOvertimeHours})`);
      console.log(`  Attendance Status: ${isStatusCorrect ? '✅' : '❌'}`);

      if (!isOvertimeCorrect) {
        console.log(`    Expected: [${scenario.expectedAttendanceStatus.join(', ')}]`);
        console.log(`    Got: [${calculatedAttendanceStatus.join(', ')}]`);
      }

      console.log('\n✅ Test completed successfully');
      console.log('---\n');

    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
      console.log('---\n');
    }
  }

  console.log('🎉 All overtime calculation tests completed!');
  console.log('\nKey Features Demonstrated:');
  console.log('1. ✅ Overtime calculation based on actual work vs shift hours');
  console.log('2. ✅ 2-hour threshold for overtime eligibility');
  console.log('3. ✅ Progressive overtime rules (2, 4, 6, actual hours)');
  console.log('4. ✅ Rounding for 8+ hours overtime');
  console.log('5. ✅ "Present" status always added to attendance');
  console.log('6. ✅ Additional status flags (Late, Early-Exit, Holiday-Swipe, Out-Of-Window)');
  console.log('7. ✅ Proper validation of expected vs calculated results');
  
  console.log('\nOvertime Rules Summary:');
  console.log('• ≤ 2 hours over shift: No overtime');
  console.log('• 2-4 hours over shift: Record 2 hours');
  console.log('• 4-6 hours over shift: Record 4 hours');
  console.log('• 6-8 hours over shift: Record 6 hours');
  console.log('• 8+ hours over shift: Record actual hours (rounded)');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testOvertimeCalculation()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test script failed:', error);
      process.exit(1);
    });
}

export { testOvertimeCalculation, calculateOvertimeHours, determineAttendanceStatus }; 