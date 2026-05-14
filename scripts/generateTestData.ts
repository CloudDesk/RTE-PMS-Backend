import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { 
  User, 
  Shift, 
  ShiftAssignment, 
  Training, 
  TrainingAssignment,
} from '../src/models';
import { AttendanceRecord } from '../src/models/attendance-record.model';
import { TrainingAttendanceRecord } from '../src/models/training-attendance.model';
import { Leave } from '../src/models/leave.model';
import { LeaveSummary } from '../src/models/leave-summary.model';
import { Types } from 'mongoose';

dotenv.config();

const SHIFTS = [
  {
    name: 'Morning Shift',
    code: 'MORN',
    startTime: '09:00',
    endTime: '18:00',
    shiftWindowStart: '08:30',
    shiftWindowEnd: '18:30',
    graceTimeInMinutes: 15
  },
  {
    name: 'Afternoon Shift',
    code: 'NOON',
    startTime: '13:00',
    endTime: '22:00',
    shiftWindowStart: '12:30',
    shiftWindowEnd: '22:30',
    graceTimeInMinutes: 15
  }
];

const TRAININGS = [
  {
    name: 'New Employee Orientation',
    code: 'NEO',
    startTime: '10:00',
    endTime: '16:00',
    trainingWindowStart: '09:30',
    trainingWindowEnd: '16:30',
    location: 'Training Room A',
    maxParticipants: 20,
    prerequisites: ['Company Email Setup'],
    materials: ['Orientation Handbook', 'Company Policies'],
    objectives: ['Understand company policies', 'Learn about benefits'],
    assessmentCriteria: ['Attendance', 'Policy Quiz']
  },
  {
    name: 'Leadership Skills',
    code: 'LEAD',
    startTime: '14:00',
    endTime: '17:00',
    trainingWindowStart: '13:30',
    trainingWindowEnd: '17:30',
    location: 'Conference Room B',
    maxParticipants: 15,
    prerequisites: ['1 Year Experience'],
    materials: ['Leadership Guide', 'Case Studies'],
    objectives: ['Team Management', 'Decision Making'],
    assessmentCriteria: ['Project Work', 'Presentation']
  }
];

async function cleanup() {
  console.log('Cleaning up existing data...');
  try {
    await Promise.all([
      Shift.deleteMany({}),
      ShiftAssignment.deleteMany({}),
      Training.deleteMany({}),
      TrainingAssignment.deleteMany({}),
      AttendanceRecord.deleteMany({}),
      TrainingAttendanceRecord.deleteMany({}),
      Leave.deleteMany({}),
      LeaveSummary.deleteMany({})
    ]);
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

async function generateData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Clean up existing data first
    await cleanup();

    // Get existing users
    const users = await User.find({});
    const managers = users.filter(user => user.email.includes('manager'));
    const employees = users.filter(user => !user.email.includes('manager'));
    
    // Create shifts
    const shiftDocs = await Promise.all(
      SHIFTS.map(async shift => {
        const shiftDoc = await Shift.create({
          ...shift,
          applicableForRoles: [], // Add role IDs here
          validFrom: new Date('2024-01-01'),
          isActive: true
        });
        console.log(`Created shift: ${shift.name}`);
        return shiftDoc;
      })
    );

    // Create trainings
    const trainingDocs = await Promise.all(
      TRAININGS.map(async training => {
        const trainer = managers[Math.floor(Math.random() * managers.length)];
        const trainingDoc = await Training.create({
          ...training,
          trainer: trainer._id,
          applicableForRoles: [], // Add role IDs here
          validFrom: new Date('2024-01-01'),
          isActive: true
        });
        console.log(`Created training: ${training.name}`);
        return trainingDoc;
      })
    );

    // Generate data from Jan 1, 2024 to current date
    const startDate = new Date('2024-01-01');
    const endDate = new Date();
    const currentDate = new Date(startDate);

    // Assign shifts to employees
    for (const employee of employees) {
      const shift = shiftDocs[Math.floor(Math.random() * shiftDocs.length)];
      await ShiftAssignment.create({
        userId: employee._id,
        shiftId: shift._id,
        shiftCode: shift.code,
        startDate: new Date('2024-01-01'),
        isActive: true,
        assignedBy: managers[0]._id
      });
      console.log(`Assigned shift to: ${employee.name}`);
    }

    // Generate attendance records and leave requests
    while (currentDate <= endDate) {
      for (const employee of employees) {
        const employeeShift = await ShiftAssignment.findOne({ 
          userId: employee._id,
          startDate: { $lte: currentDate },
          $or: [
            { endDate: { $gte: currentDate } },
            { endDate: null }
          ]
        });

        if (employeeShift) {
          // Check if attendance record already exists for this user, day and shift
          const existingAttendance = await AttendanceRecord.findOne({
            userId: employee._id,
            shiftDay: currentDate,
            shiftCode: employeeShift.shiftCode
          });

          if (!existingAttendance) {
            // 80% chance of attendance, 20% chance of leave/absence
            if (Math.random() < 0.8) {
              const shift = await Shift.findById(employeeShift.shiftId);
              if (shift) {
                // Create proper check-in time with UTC handling
                const [shiftHour, shiftMinute] = shift.startTime.split(':').map(Number);
                const checkInTime = new Date(currentDate);
                const randomEarlyMinutes = Math.random() < 0.1 ? -Math.floor(Math.random() * 30) : 0;
                const randomLateMinutes = Math.random() < 0.1 ? Math.floor(Math.random() * 30) : 0;
                checkInTime.setUTCHours(shiftHour, shiftMinute + randomEarlyMinutes + randomLateMinutes, 0, 0);

                // Create proper check-out time with UTC handling
                const [endHour, endMinute] = shift.endTime.split(':').map(Number);
                const checkOutTime = new Date(currentDate);
                const randomEarlyExitMinutes = Math.random() < 0.1 ? -Math.floor(Math.random() * 30) : 0;
                const randomLateExitMinutes = Math.random() < 0.1 ? Math.floor(Math.random() * 30) : 0;
                checkOutTime.setUTCHours(endHour, endMinute + randomEarlyExitMinutes + randomLateExitMinutes, 0, 0);

                // Ensure checkout time is after checkin time
                if (checkOutTime <= checkInTime) {
                  checkOutTime.setUTCDate(checkOutTime.getUTCDate() + 1);
                }

                // For debugging
                console.log({
                  shiftStart: checkInTime.toISOString(),
                  shiftEnd: checkOutTime.toISOString(),
                  startHour: shiftHour,
                  endHour: endHour
                });

                // Determine attendance status
                const isLate = randomLateMinutes > (shift.graceTimeInMinutes || 15);
                const isEarlyExit = randomEarlyExitMinutes < 0;
                const attendanceStatus: ('Late' | 'On-Time' | 'Early-Exit' | 'Absent')[] = [];
                if (isLate) attendanceStatus.push('Late');
                if (isEarlyExit) attendanceStatus.push('Early-Exit');
                if (!isLate && !isEarlyExit) attendanceStatus.push('On-Time');
                console.log({
                  userId: employee._id,
                  shiftId: shift._id,
                  shiftCode: shift.code,
                  shiftDay: currentDate,
                  shiftStart: checkInTime,
                  shiftEnd: checkOutTime,
                  swipes: [
                    {
                      timestamp: checkInTime,
                      direction: 'IN',
                      deviceId: 'DEVICE001',
                      location: 'Main Entrance'
                    },
                    {
                      timestamp: checkOutTime,
                      direction: 'OUT',
                      deviceId: 'DEVICE001',
                      location: 'Main Entrance'
                    }
                  ],
                  isWithinWindow: !isLate && !isEarlyExit,
                  isLateEntry: isLate,
                  isEarlyExit: isEarlyExit,
                  status: 'complete',
                  attendanceStatus
                });
                await AttendanceRecord.create({
                  userId: employee._id,
                  shiftId: shift._id,
                  shiftCode: shift.code,
                  shiftDay: currentDate,
                  shiftStart: checkInTime,
                  shiftEnd: checkOutTime,
                  swipes: [
                    {
                      timestamp: checkInTime,
                      direction: 'IN',
                      deviceId: 'DEVICE001',
                      location: 'Main Entrance'
                    },
                    {
                      timestamp: checkOutTime,
                      direction: 'OUT',
                      deviceId: 'DEVICE001',
                      location: 'Main Entrance'
                    }
                  ],
                  isWithinWindow: !isLate && !isEarlyExit,
                  isLateEntry: isLate,
                  isEarlyExit: isEarlyExit,
                  status: 'complete',
                  attendanceStatus
                });
              }
            } else if (Math.random() < 0.5) { // 50% chance of leave request for absent days
              const leaveEndDate = new Date(currentDate);
              leaveEndDate.setDate(leaveEndDate.getDate() + Math.floor(Math.random() * 3));
              
              const leaveRequest = await Leave.create({
                userId: employee._id,
                leaveTypeId: new Types.ObjectId(), // Add actual leave type ID
                startDate: currentDate,
                endDate: leaveEndDate,
                status: Math.random() < 0.8 ? 'Approved' : 'Pending',
                remarks: 'Sample leave request'
              });

              if (leaveRequest.status === 'Approved') {
                leaveRequest.approvedById = managers[0]._id;
                leaveRequest.approvedAt = new Date();
                await leaveRequest.save();

                // Create attendance records for approved leave days
                const leaveDate = new Date(currentDate);
                while (leaveDate <= leaveEndDate) {
                  // Check if attendance record already exists
                  const existingLeaveAttendance = await AttendanceRecord.findOne({
                    userId: employee._id,
                    shiftDay: leaveDate,
                    shiftCode: employeeShift.shiftCode
                  });

                  if (!existingLeaveAttendance) {
                    const shift = await Shift.findById(employeeShift.shiftId);
                    if (shift) {
                      const [shiftHour, shiftMinute] = shift.startTime.split(':').map(Number);
                      const [endHour, endMinute] = shift.endTime.split(':').map(Number);
                      const shiftStart = new Date(leaveDate);
                      const shiftEnd = new Date(leaveDate);
                      shiftStart.setUTCHours(shiftHour, shiftMinute, 0, 0);
                      shiftEnd.setUTCHours(endHour, endMinute, 0, 0);

                      await AttendanceRecord.create({
                        userId: employee._id,
                        shiftId: employeeShift.shiftId,
                        shiftCode: employeeShift.shiftCode,
                        shiftDay: new Date(leaveDate),
                        shiftStart,
                        shiftEnd,
                        status: 'complete',
                        attendanceStatus: ['On-Leave'],
                        leaveRequestId: leaveRequest._id,
                        swipes: [], // No swipes for leave days
                        isWithinWindow: true,
                        isLateEntry: false,
                        isEarlyExit: false,
                        overtime: '0:00:00',
                        shortTime: '0:00:00'
                      });
                    }
                  }
                  leaveDate.setDate(leaveDate.getDate() + 1);
                }
              }
            }
          }
        }
      }

      // Assign trainings randomly
      if (Math.random() < 0.2) { // 20% chance of training on any day
        const training = trainingDocs[Math.floor(Math.random() * trainingDocs.length)];
        const trainees = employees.slice(0, Math.floor(Math.random() * 5) + 1); // 1-5 trainees

        for (const trainee of trainees) {
          // Check if trainee already has a training assignment for this day
          const existingAssignment = await TrainingAssignment.findOne({
            userId: trainee._id,
            startDate: { $lte: currentDate },
            $or: [
              { endDate: { $gte: currentDate } },
              { endDate: null }
            ],
            isActive: true
          });

          if (!existingAssignment) {
            await TrainingAssignment.create({
              userId: trainee._id,
              trainingId: training._id,
              trainingCode: training.code,
              startDate: currentDate,
              isActive: true,
              assignedBy: managers[0]._id
            });

            // Also check for existing training attendance record
            const existingAttendance = await TrainingAttendanceRecord.findOne({
              userId: trainee._id,
              trainingDay: currentDate,
              trainingCode: training.code
            });

            if (!existingAttendance) {
              // Create training attendance record with UTC handling
              const [startHour, startMinute] = training.startTime.split(':').map(Number);
              const checkInTime = new Date(currentDate);
              const trainingRandomEarly = Math.random() < 0.1 ? -Math.floor(Math.random() * 15) : 0;
              const trainingRandomLate = Math.random() < 0.1 ? Math.floor(Math.random() * 15) : 0;
              checkInTime.setUTCHours(startHour, startMinute + trainingRandomEarly + trainingRandomLate, 0, 0);

              const [endHour, endMinute] = training.endTime.split(':').map(Number);
              const checkOutTime = new Date(currentDate);
              const trainingRandomEarlyExit = Math.random() < 0.1 ? -Math.floor(Math.random() * 15) : 0;
              const trainingRandomLateExit = Math.random() < 0.1 ? Math.floor(Math.random() * 15) : 0;
              checkOutTime.setUTCHours(endHour, endMinute + trainingRandomEarlyExit + trainingRandomLateExit, 0, 0);

              // Determine training attendance status
              const isTrainingLate = trainingRandomLate > 0;
              const isTrainingEarlyExit = trainingRandomEarlyExit < 0;
              const trainingAttendanceStatus: ('Late' | 'On-Time' | 'Early-Exit' | 'Absent')[] = [];
              if (isTrainingLate) trainingAttendanceStatus.push('Late');
              if (isTrainingEarlyExit) trainingAttendanceStatus.push('Early-Exit');
              if (!isTrainingLate && !isTrainingEarlyExit) trainingAttendanceStatus.push('On-Time');

              await TrainingAttendanceRecord.create({
                userId: trainee._id,
                trainingId: training._id,
                trainingCode: training.code,
                trainingDay: currentDate,
                trainingStart: checkInTime,
                trainingEnd: checkOutTime,
                swipes: [
                  {
                    timestamp: checkInTime,
                    direction: 'IN',
                    deviceId: 'DEVICE001',
                    location: training.location
                  },
                  {
                    timestamp: checkOutTime,
                    direction: 'OUT',
                    deviceId: 'DEVICE001',
                    location: training.location
                  }
                ],
                isWithinWindow: !isTrainingLate && !isTrainingEarlyExit,
                isLateEntry: isTrainingLate,
                isEarlyExit: isTrainingEarlyExit,
                status: 'complete',
                attendanceStatus: trainingAttendanceStatus
              });
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Generate future leave requests
    for (const employee of employees) {
      if (Math.random() < 0.3) { // 30% chance of future leave request
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 30) + 1);
        const leaveEndDate = new Date(futureDate);
        leaveEndDate.setDate(leaveEndDate.getDate() + Math.floor(Math.random() * 3));

        await Leave.create({
          userId: employee._id,
          leaveTypeId: new Types.ObjectId(), // Add actual leave type ID
          startDate: futureDate,
          endDate: leaveEndDate,
          status: 'Pending',
          remarks: 'Future leave request'
        });
      }
    }

    // Generate leave summaries for all employees
    for (const employee of employees) {
      await LeaveSummary.create({
        userId: employee._id,
        year: 2024,
        annual: {
          alloted: 20,
          availed: Math.floor(Math.random() * 10),
          remaining: 10,
          leaveRequests: []
        },
        sick: {
          alloted: 12,
          availed: Math.floor(Math.random() * 6),
          remaining: 6,
          leaveRequests: []
        },
        compOff: {
          alloted: 5,
          availed: Math.floor(Math.random() * 3),
          remaining: 2,
          leaveRequests: []
        },
        lossOfPay: {
          alloted: 0,
          availed: Math.floor(Math.random() * 2),
          remaining: 0,
          leaveRequests: []
        }
      });
    }

    console.log('Test data generation completed');
    process.exit(0);
  } catch (error) {
    console.error('Error generating test data:', error);
    process.exit(1);
  }
}

generateData(); 