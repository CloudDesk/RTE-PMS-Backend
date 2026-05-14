import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { 
  User, 
  Training, 
  TrainingAssignment
} from '../src/models';
import { TrainingAttendanceRecord } from '../src/models/training-attendance.model';

dotenv.config();

async function cleanup() {
  console.log('Cleaning up existing training data...');
  try {
    await Promise.all([
      TrainingAssignment.deleteMany({ startDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) } }),
      TrainingAttendanceRecord.deleteMany({ trainingDay: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) } })
    ]);
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

async function generateTrainingData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log('Connected to MongoDB');

    // Clean up last month's training data
    await cleanup();

    // Get existing users and trainings
    const [users, trainings] = await Promise.all([
      User.find({}),
      Training.find({ isActive: true })
    ]);

    const managers = users.filter(user => user.email.includes('manager'));
    const employees = users.filter(user => !user.email.includes('manager'));

    // Generate data for the last month
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 1);
    startDate.setDate(1); // Start from the 1st of last month
    const endDate = new Date();
    endDate.setDate(0); // Last day of last month
    const currentDate = new Date(startDate);

    console.log(`Generating training data from ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // Generate training assignments and attendance
    while (currentDate <= endDate) {
      // 30% chance of having trainings on any day
      if (Math.random() < 0.3 && trainings.length > 0) {
        // Pick 1-2 random trainings for the day
        const numTrainings = Math.floor(Math.random() * 2) + 1;
        const dayTrainings = trainings
          .sort(() => Math.random() - 0.5)
          .slice(0, numTrainings);

        for (const training of dayTrainings) {
          // Select 3-8 random employees for each training
          const numTrainees = Math.floor(Math.random() * 6) + 3;
          const trainees = employees
            .sort(() => Math.random() - 0.5)
            .slice(0, numTrainees);

          for (const trainee of trainees) {
            // Check for existing assignments/attendance
            const [existingAssignment, existingAttendance] = await Promise.all([
              TrainingAssignment.findOne({
                userId: trainee._id,
                startDate: { $lte: currentDate },
                $or: [
                  { endDate: { $gte: currentDate } },
                  { endDate: null }
                ],
                isActive: true
              }),
              TrainingAttendanceRecord.findOne({
                userId: trainee._id,
                trainingDay: currentDate,
                trainingCode: training.code
              })
            ]);

            if (!existingAssignment && !existingAttendance) {
              // Create training assignment
              await TrainingAssignment.create({
                userId: trainee._id,
                trainingId: training._id,
                trainingCode: training.code,
                startDate: currentDate,
                isActive: true,
                assignedBy: managers[0]._id
              });

              // Create attendance with realistic timing
              const [startHour, startMinute] = training.startTime.split(':').map(Number);
              const [endHour, endMinute] = training.endTime.split(':').map(Number);

              // 90% chance of attending, 10% chance of absence
              if (Math.random() < 0.9) {
                const checkInTime = new Date(currentDate);
                const checkOutTime = new Date(currentDate);

                // Randomize attendance patterns
                const isLate = Math.random() < 0.15; // 15% chance of being late
                const isEarlyExit = Math.random() < 0.1; // 10% chance of early exit

                // Set check-in time with variations
                const lateMinutes = isLate ? Math.floor(Math.random() * 20) : 0;
                checkInTime.setUTCHours(startHour, startMinute + lateMinutes, 0, 0);

                // Set check-out time with variations
                const earlyMinutes = isEarlyExit ? -Math.floor(Math.random() * 30) : Math.floor(Math.random() * 15);
                checkOutTime.setUTCHours(endHour, endMinute + earlyMinutes, 0, 0);

                // Determine attendance status
                const attendanceStatus: ('Late' | 'On-Time' | 'Early-Exit' | 'Absent')[] = [];
                if (isLate) attendanceStatus.push('Late');
                if (isEarlyExit) attendanceStatus.push('Early-Exit');
                if (!isLate && !isEarlyExit) attendanceStatus.push('On-Time');

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
                  isWithinWindow: !isLate && !isEarlyExit,
                  isLateEntry: isLate,
                  isEarlyExit: isEarlyExit,
                  status: 'complete',
                  attendanceStatus
                });

                console.log(`Created training attendance for ${trainee.name} - ${training.name} on ${currentDate.toISOString()}`);
              } else {
                // Create absent record
                await TrainingAttendanceRecord.create({
                  userId: trainee._id,
                  trainingId: training._id,
                  trainingCode: training.code,
                  trainingDay: currentDate,
                  trainingStart: new Date(currentDate),
                  trainingEnd: new Date(currentDate),
                  swipes: [],
                  isWithinWindow: false,
                  isLateEntry: false,
                  isEarlyExit: false,
                  status: 'incomplete',
                  attendanceStatus: ['Absent']
                });

                console.log(`Marked absence for ${trainee.name} - ${training.name} on ${currentDate.toISOString()}`);
              }
            }
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    console.log('Training data generation completed');
    process.exit(0);
  } catch (error) {
    console.error('Error generating training data:', error);
    process.exit(1);
  }
}

generateTrainingData(); 