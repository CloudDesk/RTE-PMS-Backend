import mongoose from 'mongoose';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

async function hasingTest(email: string, password: string) {
  console.log('Rehash and Compare attempt:', email);

  try {
    await mongoose.connect(process.env.MONGODB_URI!);

    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new Error('User not found');

    console.log('Stored Hashed Password from DB:', user.password);

    // Compare the hash with the generated hash of the provided password
    const isValidPassword = await argon2.verify(user.password, password);
    console.log('Password Verification Result:', isValidPassword);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    console.log('Login successful for:', email);
    return user;
  } catch (error) {
    console.error('Error during login:', error);
    throw new Error('Login error');
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

hasingTest('data@gmail.com', 'Passcode').catch(console.error);
