/**
 * Test script to demonstrate overtime calculation edge cases
 * This script specifically tests the boundary conditions for overtime calculation
 */

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

interface EdgeCaseTest {
  name: string;
  shiftHours: number;
  actualWorkHours: number;
  expectedOvertimeHours: number;
  explanation: string;
}

const edgeCaseTests: EdgeCaseTest[] = [
  {
    name: "Exactly 2 hours over shift",
    shiftHours: 8,
    actualWorkHours: 10, // 8 + 2 = 10
    expectedOvertimeHours: 0,
    explanation: "Exactly 2 hours over - should return 0 (no overtime)"
  },
  {
    name: "2.01 hours over shift",
    shiftHours: 8,
    actualWorkHours: 10.01, // 8 + 2.01 = 10.01
    expectedOvertimeHours: 2,
    explanation: "Just over 2 hours - should return 2 (2-4 hour bracket)"
  },
  {
    name: "Exactly 4 hours over shift",
    shiftHours: 8,
    actualWorkHours: 12, // 8 + 4 = 12
    expectedOvertimeHours: 2,
    explanation: "Exactly 4 hours over - should return 2 (2-4 hour bracket, inclusive)"
  },
  {
    name: "4.01 hours over shift",
    shiftHours: 8,
    actualWorkHours: 12.01, // 8 + 4.01 = 12.01
    expectedOvertimeHours: 4,
    explanation: "Just over 4 hours - should return 4 (4-6 hour bracket)"
  },
  {
    name: "Exactly 6 hours over shift",
    shiftHours: 8,
    actualWorkHours: 14, // 8 + 6 = 14
    expectedOvertimeHours: 4,
    explanation: "Exactly 6 hours over - should return 4 (4-6 hour bracket, inclusive)"
  },
  {
    name: "6.01 hours over shift",
    shiftHours: 8,
    actualWorkHours: 14.01, // 8 + 6.01 = 14.01
    expectedOvertimeHours: 6,
    explanation: "Just over 6 hours - should return 6 (6-8 hour bracket)"
  },
  {
    name: "Exactly 8 hours over shift",
    shiftHours: 8,
    actualWorkHours: 16, // 8 + 8 = 16
    expectedOvertimeHours: 6,
    explanation: "Exactly 8 hours over - should return 6 (6-8 hour bracket, inclusive)"
  },
  {
    name: "8.01 hours over shift",
    shiftHours: 8,
    actualWorkHours: 16.01, // 8 + 8.01 = 16.01
    expectedOvertimeHours: 8,
    explanation: "Just over 8 hours - should return 8 (actual rounded)"
  },
  {
    name: "8.5 hours over shift",
    shiftHours: 8,
    actualWorkHours: 16.5, // 8 + 8.5 = 16.5
    expectedOvertimeHours: 9,
    explanation: "8.5 hours over - should return 9 (actual rounded)"
  },
  {
    name: "9.3 hours over shift",
    shiftHours: 8,
    actualWorkHours: 17.3, // 8 + 9.3 = 17.3
    expectedOvertimeHours: 9,
    explanation: "9.3 hours over - should return 9 (actual rounded)"
  }
];

async function testOvertimeEdgeCases() {
  console.log('🧪 Testing Overtime Calculation Edge Cases\n');
  console.log('📋 Question: If the exceeds shift hours is exactly 4, the OT calculation hour is how much?\n');

  for (const test of edgeCaseTests) {
    console.log(`📋 Test: ${test.name}`);
    console.log(`Explanation: ${test.explanation}`);
    console.log('');

    try {
      // Convert hours to milliseconds for calculation
      const shiftMs = test.shiftHours * 60 * 60 * 1000;
      const actualWorkMs = test.actualWorkHours * 60 * 60 * 1000;
      
      console.log('Input Data:');
      console.log(`  Shift Duration: ${test.shiftHours} hours (${formatTimeFromMs(shiftMs)})`);
      console.log(`  Actual Work: ${test.actualWorkHours} hours (${formatTimeFromMs(actualWorkMs)})`);
      console.log(`  Difference: ${(test.actualWorkHours - test.shiftHours).toFixed(2)} hours`);

      // Calculate overtime
      const calculatedOvertimeHours = calculateOvertimeHours(actualWorkMs, shiftMs);
      
      console.log('\nOvertime Calculation:');
      console.log(`  Calculated Overtime: ${calculatedOvertimeHours} hours`);
      console.log(`  Expected Overtime: ${test.expectedOvertimeHours} hours`);

      // Validate results
      const isCorrect = calculatedOvertimeHours === test.expectedOvertimeHours;

      console.log('\nValidation:');
      console.log(`  Result: ${isCorrect ? '✅' : '❌'} (Expected: ${test.expectedOvertimeHours}, Got: ${calculatedOvertimeHours})`);

      if (!isCorrect) {
        console.log(`  ❌ FAILED: Expected ${test.expectedOvertimeHours} but got ${calculatedOvertimeHours}`);
      }

      console.log('\n✅ Test completed');
      console.log('---\n');

    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
      console.log('---\n');
    }
  }

  console.log('🎉 All edge case tests completed!');
  console.log('\n📊 Overtime Calculation Logic Summary:');
  console.log('```typescript');
  console.log('if (overtimeHours <= 2) return 0;        // No overtime');
  console.log('if (overtimeHours <= 4) return 2;        // 2-4 hrs → record 2 hrs');
  console.log('else if (overtimeHours <= 6) return 4;   // 4-6 hrs → record 4 hrs');
  console.log('else if (overtimeHours <= 8) return 6;   // 6-8 hrs → record 6 hrs');
  console.log('else return Math.round(overtimeHours);   // 8+ hrs → actual (rounded)');
  console.log('```');
  
  console.log('\n🎯 Answer to Your Question:');
  console.log('❓ "If the exceeds shift hours is exactly 4, the OT calculation hour is how much?"');
  console.log('✅ ANSWER: If work exceeds shift by exactly 4 hours, it returns 2 hours overtime');
  console.log('   This is because the condition is: if (overtimeHours <= 4) return 2;');
  console.log('   So 4.0 hours falls into the 2-4 hour bracket and returns 2 hours');
  
  console.log('\n📋 Boundary Ranges:');
  console.log('• 2.01 - 4.00 hours over shift → 2 hours overtime');
  console.log('• 4.01 - 6.00 hours over shift → 4 hours overtime');
  console.log('• 6.01 - 8.00 hours over shift → 6 hours overtime');
  console.log('• 8.01+ hours over shift → actual hours (rounded)');
  
  console.log('\n🔍 Key Points:');
  console.log('• The conditions use <= (less than or equal to)');
  console.log('• Each bracket is inclusive of the upper bound');
  console.log('• 4.0 hours exactly falls into the 2-4 hour bracket');
  console.log('• 4.01 hours falls into the 4-6 hour bracket');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testOvertimeEdgeCases()
    .then(() => {
      console.log('\n🎉 Edge case test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Edge case test script failed:', error);
      process.exit(1);
    });
}

export { testOvertimeEdgeCases, calculateOvertimeHours }; 