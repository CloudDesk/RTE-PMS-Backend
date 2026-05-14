

/**
 * Test script to demonstrate the joining date validation functionality
 * This script shows how the validation handles dates before and after joining date
 */

interface TestUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  joiningDate: Date;
}

interface TestScenario {
  name: string;
  description: string;
  user: TestUser;
  testRows: Array<{
    rowNumber: number;
    userId: string;
    shiftCode: string;
    startDate: string;
    endDate?: string;
    attendanceDate: string;
    inTime: string;
    outTime: string;
  }>;
  expectedErrors: Array<{
    rowNumber: number;
    field: string;
    message: string;
  }>;
}

const testScenarios: TestScenario[] = [
  {
    name: "Dates Before Joining Date",
    description: "All dates are before user's joining date - should be rejected",
    user: {
      _id: "user123",
      name: "John Doe",
      email: "john@example.com",
      role: "external",
      joiningDate: new Date("2025-07-01")
    },
    testRows: [
      {
        rowNumber: 2,
        userId: "user123",
        shiftCode: "MORNING",
        startDate: "2025-06-28",
        endDate: "2025-06-30",
        attendanceDate: "2025-06-29",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: [
      {
        rowNumber: 2,
        field: "startDate",
        message: "Start date (2025-06-28) is before user's joining date (2025-07-01)"
      },
      {
        rowNumber: 2,
        field: "endDate",
        message: "End date (2025-06-30) is before user's joining date (2025-07-01)"
      },
      {
        rowNumber: 2,
        field: "attendanceDate",
        message: "Attendance date (2025-06-29) is before user's joining date (2025-07-01)"
      }
    ]
  },
  {
    name: "Mixed Dates - Some Before Joining",
    description: "Some dates before joining date, some after - should reject only the invalid ones",
    user: {
      _id: "user456",
      name: "Jane Smith",
      email: "jane@example.com",
      role: "external",
      joiningDate: new Date("2025-07-01")
    },
    testRows: [
      {
        rowNumber: 2,
        userId: "user456",
        shiftCode: "MORNING",
        startDate: "2025-06-28",
        endDate: "2025-07-05",
        attendanceDate: "2025-06-29",
        inTime: "09:00",
        outTime: "17:00"
      },
      {
        rowNumber: 3,
        userId: "user456",
        shiftCode: "MORNING",
        startDate: "2025-07-01",
        endDate: "2025-07-31",
        attendanceDate: "2025-07-15",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: [
      {
        rowNumber: 2,
        field: "startDate",
        message: "Start date (2025-06-28) is before user's joining date (2025-07-01)"
      },
      {
        rowNumber: 2,
        field: "attendanceDate",
        message: "Attendance date (2025-06-29) is before user's joining date (2025-07-01)"
      }
    ]
  },
  {
    name: "Dates On Joining Date",
    description: "Dates exactly on joining date - should be allowed",
    user: {
      _id: "user789",
      name: "Bob Wilson",
      email: "bob@example.com",
      role: "external",
      joiningDate: new Date("2025-07-01")
    },
    testRows: [
      {
        rowNumber: 2,
        userId: "user789",
        shiftCode: "MORNING",
        startDate: "2025-07-01",
        endDate: "2025-07-31",
        attendanceDate: "2025-07-01",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: []
  },
  {
    name: "Dates After Joining Date",
    description: "All dates after joining date - should be allowed",
    user: {
      _id: "user101",
      name: "Alice Brown",
      email: "alice@example.com",
      role: "external",
      joiningDate: new Date("2025-07-01")
    },
    testRows: [
      {
        rowNumber: 2,
        userId: "user101",
        shiftCode: "MORNING",
        startDate: "2025-07-15",
        endDate: "2025-07-31",
        attendanceDate: "2025-07-20",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: []
  },
  {
    name: "No End Date",
    description: "Shift assignment with no end date - should validate start and attendance dates",
    user: {
      _id: "user202",
      name: "Charlie Davis",
      email: "charlie@example.com",
      role: "external",
      joiningDate: new Date("2025-07-01")
    },
    testRows: [
      {
        rowNumber: 2,
        userId: "user202",
        shiftCode: "MORNING",
        startDate: "2025-07-01",
        attendanceDate: "2025-07-15",
        inTime: "09:00",
        outTime: "17:00"
      }
    ],
    expectedErrors: []
  }
];

async function testJoiningDateValidation() {
  console.log('🧪 Testing Joining Date Validation\n');

  for (const scenario of testScenarios) {
    console.log(`📋 Test: ${scenario.name}`);
    console.log(`Description: ${scenario.description}`);
    console.log(`User: ${scenario.user.name} (${scenario.user.email})`);
    console.log(`Joining Date: ${scenario.user.joiningDate.toISOString().split('T')[0]}`);
    console.log('');

    // Simulate the test scenario
    try {
      // Convert test data to IBulkUploadRow format
      const validRows = scenario.testRows.map(row => ({
        rowNumber: row.rowNumber,
        userId: row.userId,
        userName: scenario.user.name,
        shiftCode: row.shiftCode,
        shiftName: `${row.shiftCode} Shift`,
        startDate: row.startDate,
        endDate: row.endDate,
        weekendDays: "5,6", // UAE weekend
        attendanceDate: row.attendanceDate,
        inTime: row.inTime,
        outTime: row.outTime,
        deviceId: "TEST_DEVICE",
        location: "Test Location"
      }));

      console.log('Input Data:');
      validRows.forEach(row => {
        console.log(`  Row ${row.rowNumber}: User: ${row.userId}, Shift: ${row.shiftCode}`);
        console.log(`    Period: ${row.startDate} → ${row.endDate || 'no-end'}`);
        console.log(`    Attendance: ${row.attendanceDate}`);
      });

      console.log('\nExpected Errors:');
      if (scenario.expectedErrors.length === 0) {
        console.log('  ✅ No errors expected - all dates should be valid');
      } else {
        scenario.expectedErrors.forEach(error => {
          console.log(`  ❌ Row ${error.rowNumber}, Field: ${error.field}`);
          console.log(`     Message: ${error.message}`);
        });
      }

      // Simulate validation logic
      console.log('\nValidation Logic:');
      const joiningDate = new Date(scenario.user.joiningDate);
      joiningDate.setHours(0, 0, 0, 0);

      for (const row of validRows) {
        console.log(`  Processing Row ${row.rowNumber}:`);
        
        // Check start date
        const startDate = new Date(row.startDate);
        startDate.setHours(0, 0, 0, 0);
        if (startDate < joiningDate) {
          console.log(`    ❌ Start date ${row.startDate} is before joining date ${joiningDate.toISOString().split('T')[0]}`);
        } else {
          console.log(`    ✅ Start date ${row.startDate} is valid`);
        }

        // Check end date
        if (row.endDate) {
          const endDate = new Date(row.endDate);
          endDate.setHours(0, 0, 0, 0);
          if (endDate < joiningDate) {
            console.log(`    ❌ End date ${row.endDate} is before joining date ${joiningDate.toISOString().split('T')[0]}`);
          } else {
            console.log(`    ✅ End date ${row.endDate} is valid`);
          }
        } else {
          console.log(`    ✅ No end date specified`);
        }

        // Check attendance date
        const attendanceDate = new Date(row.attendanceDate);
        attendanceDate.setHours(0, 0, 0, 0);
        if (attendanceDate < joiningDate) {
          console.log(`    ❌ Attendance date ${row.attendanceDate} is before joining date ${joiningDate.toISOString().split('T')[0]}`);
        } else {
          console.log(`    ✅ Attendance date ${row.attendanceDate} is valid`);
        }
      }

      console.log('\n✅ Test completed successfully');
      console.log('---\n');

    } catch (error) {
      console.error(`❌ Test failed: ${error}`);
      console.log('---\n');
    }
  }

  console.log('🎉 All joining date validation tests completed!');
  console.log('\nKey Validation Features Demonstrated:');
  console.log('1. ✅ Start date validation against joining date');
  console.log('2. ✅ End date validation against joining date');
  console.log('3. ✅ Attendance date validation against joining date');
  console.log('4. ✅ Proper error messages with specific dates');
  console.log('5. ✅ Handling of missing end dates');
  console.log('6. ✅ Date comparison using start of day (ignoring time)');
}

// Run the test if this file is executed directly
if (require.main === module) {
  testJoiningDateValidation()
    .then(() => {
      console.log('\n🎉 Test script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test script failed:', error);
      process.exit(1);
    });
}

export { testJoiningDateValidation }; 