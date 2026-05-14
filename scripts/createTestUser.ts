import mongoose from 'mongoose';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const createTestUser = async () => {
  try {
    console.log(process.env.MONGODB_URI, 'URI is ==>>');
    await mongoose.connect(process.env.MONGODB_URI!);

    const plainPassword = 'TestPassword123';
    const hashedPassword = await argon2.hash(plainPassword);
    console.log(plainPassword, 'Plain Password');
    console.log(hashedPassword, 'Hashed Password');
    const testUser = new User({
      name: 'Pravin',
      email: 'pravinraja@clouddesk.ae',
      password: hashedPassword,
      role: 'admin',
      departmentId: new mongoose.Types.ObjectId('60d5f483f8d2e30db8c1a5e4'),
      biometricId: 'BIO173450',
      active: true,
      location: 'Chennai',
    });
    console.log(testUser.password, 'Password Before Saving');

    await testUser.save({ validateBeforeSave: false });
    console.log('Test user created successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Error creating test user:', error);
    process.exit(1);
  }
};

createTestUser();