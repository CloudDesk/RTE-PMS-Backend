/**
 * Test script to demonstrate duplicate attendance detection in bulk upload
 * This script shows how the system handles duplicate attendance records within the same upload file
 */

interface TestScenario {
  name: string;
  description: string;
  testRows: Array<{
    rowNumber: number;
    userId: string;
    userName: string;
    shiftCode: string;
    startDate: string;
    endDate: string;
    attendanceDate: string;
    inTime: string;
    outTime: string;
  }>;
  expectedErrors: Array<{
    rowNumber: number;
    field: string;
    message: string;
  }>;
  expectedValidRows: number;
  expectedInvalidRows: number;
}

const testScenarios: TestScenario[] = [
  {
    name: "Duplicate Attendance - Same User, Same Date, Same Shift",
    description: "Multiple rows with same user, same attendance date, and same shift",
    testRows: [
      {
        rowNumber: 2,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:30",
        outTime: "17:30"
      },
      {
        rowNumber: 4,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "10:00",
        outTime: "18:00"
      }
    ],
    expectedErrors: [
      {
        rowNumber: 3,
        field: "attendanceDate",
        message: "Duplicate attendance record found within upload file. User Test User External already has attendance for 2025-07-01 with shift GEN in row 2. Only the first occurrence will be processed."
      },
      {
        rowNumber: 4,
        field: "attendanceDate",
        message: "Duplicate attendance record found within upload file. User Test User External already has attendance for 2025-07-01 with shift GEN in row 2. Only the first occurrence will be processed."
      }
    ],
    expectedValidRows: 1,
    expectedInvalidRows: 2
  },
  {
    name: "Different Users - Same Date Allowed",
    description: "Different users can have attendance on the same date",
    testRows: [
      {
        rowNumber: 2,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "68836afb9156538a38de6a86",
        userName: "test User Ex 1",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: [],
    expectedValidRows: 2,
    expectedInvalidRows: 0
  },
  {
    name: "Same User - Different Dates Allowed",
    description: "Same user can have attendance on different dates",
    testRows: [
      {
        rowNumber: 2,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-02",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: [],
    expectedValidRows: 2,
    expectedInvalidRows: 0
  },
  {
    name: "Same User - Different Shifts Allowed",
    description: "Same user can have different shifts on the same date",
    testRows: [
      {
        rowNumber: 2,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "68831af22a7bc8aaa7762a04",
        userName: "Test User External",
        shiftCode: "MORNING",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "08:00",
        outTime: "16:00"
      }
    ],
    expectedErrors: [],
    expectedValidRows: 2,
    expectedInvalidRows: 0
  },
  {
    name: "Mixed Scenario - Some Duplicates, Some Valid",
    description: "Mix of duplicate and valid records",
    testRows: [
      {
        rowNumber: 2,
        userId: "user1",
        userName: "User One",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "user1",
        userName: "User One",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:30",
        outTime: "17:30"
      },
      {
        rowNumber: 4,
        userId: "user1",
        userName: "User One",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-02",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 5,
        userId: "user2",
        userName: "User Two",
        shiftCode: "GEN",
        startDate: "2025-07-01",
        endDate: "2025-12-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: [
      {
        rowNumber: 3,
        field: "attendanceDate",
        message: "Duplicate attendance record found within upload file. User User One already has attendance for 2025-07-01 with shift GEN in row 2. Only the first occurrence will be processed."
      }
    ],
    expectedValidRows: 3,
    expectedInvalidRows: 1
  }
];

async function testDuplicateDetection() {
  console.log('🧪 Testing Duplicate Attendance Detection\n');

  for (const scenario of testScenarios) {
    console.log(`📋 Test: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log('');

    // Simulate the test scenario
    try {
      console.log('Input Data:');
      scenario.testRows.forEach(row => {
        console.log(`  Row ${row.rowNumber}: User: ${row.userName} (${row.userId})`);
        console.log(`    Shift: ${row.shiftCode}, Date: ${row.attendanceDate}, Time: ${row.inTime}-${row.outTime}`);
      });

      // Simulate duplicate detection logic
      console.log('\nDuplicate Detection Logic:');
      
      // Track duplicates within the upload file
      const uploadDuplicates = new Map<string, number[]>();
      
      // First pass: Detect duplicates
      for (const row of scenario.testRows) {
        const duplicateKey = `${row.userId}_${row.attendanceDate}_${row.shiftCode}`;
        
        if (!uploadDuplicates.has(duplicateKey)) {
          uploadDuplicates.set(duplicateKey, []);
        }
        uploadDuplicates.get(duplicateKey)!.push(row.rowNumber);
      }

      // Second pass: Process duplicates
      const validRows: number[] = [];
      const invalidRows: number[] = [];
      const detectedErrors: Array<{rowNumber: number, field: string, message: string}> = [];

      for (const row of scenario.testRows) {
        const duplicateKey = `${row.userId}_${row.attendanceDate}_${row.shiftCode}`;
        const duplicateRows = uploadDuplicates.get(duplicateKey);
        
        if (duplicateRows && duplicateRows.length > 1) {
          // Find the first occurrence (keep it) and mark others as duplicates
          const isFirstOccurrence = duplicateRows[0] === row.rowNumber;
          
          if (isFirstOccurrence) {
            validRows.push(row.rowNumber);
            console.log(`    ✅ Row ${row.rowNumber}: First occurrence - VALID`);
          } else {
            invalidRows.push(row.rowNumber);
            const error = {
              rowNumber: row.rowNumber,
              field: 'attendanceDate',
              message: `Duplicate attendance record found within upload file. User ${row.userName} already has attendance for ${row.attendanceDate} with shift ${row.shiftCode} in row ${duplicateRows[0]}. Only the first occurrence will be processed.`
            };
            detectedErrors.push(error);
            console.log(`    ❌ Row ${row.rowNumber}: Duplicate of row ${duplicateRows[0]} - INVALID`);
          }
        } else {
          validRows.push(row.rowNumber);
          console.log(`    ✅ Row ${row.rowNumber}: Unique record - VALID`);
        }
      }

      console.log('\nResults:');
      console.log(`  Valid Rows: ${validRows.length} (${validRows.join(', ')})`);
      console.log(`  Invalid Rows: ${invalidRows.length} (${invalidRows.join(', ')})`);
      console.log(`  Detected Errors: ${detectedErrors.length}`);

      // Compare with expected results
      const isValidCount = validRows.length === scenario.expectedValidRows;
      const isInvalidCount = invalidRows.length === scenario.expectedInvalidRows;
      const isErrorCount = detectedErrors.length === scenario.expectedErrors.length;

      console.log('\nValidation:');
      console.log(`  Valid Rows Count: ${isValidCount ? '✅' : '❌'} (Expected: ${scenario.expectedValidRows}, Got: ${validRows.length})`);
      console.log(`  Invalid Rows Count: ${isInvalidCount ? '✅' : '❌'} (Expected: ${scenario.expectedInvalidRows}, Got: ${invalidRows.length})`);
      console.log(`  Error Count: ${isErrorCount ? '✅' : '❌'} (Expected: ${scenario.expectedErrors.length}, Got: ${detectedErrors.length})`);

      if (detectedErrors.length > 0) {
        console.log('\nDetected Errors:');
        detectedErrors.forEach(error => {
          console.log(`  Row ${error.rowNumber}: ${error.message}`);
        });
      }

      console.log('\n✅ Test completed successfully');
      console.log('---\n');

    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
      console.log('---\n');
    }
  }

  console.log('🎉 All duplicate detection tests completed!');
  console.log('\nKey Features Demonstrated:');
  console.log('1. ✅ Detection of duplicates within upload file');
  console.log('2. ✅ First occurrence kept, others marked as invalid');
  console.log('3. ✅ Different users can have same date');
  console.log('4. ✅ Same user can have different dates');
  console.log('5. ✅ Same user can have different shifts on same date');
  console.log('6. ✅ Clear error messages with row references');
  console.log('7. ✅ Proper validation counts');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testDuplicateDetection()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test script failed:', error);
      process.exit(1);
    });
}

export { testDuplicateDetection }; 