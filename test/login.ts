import mongoose from 'mongoose';
import argon2 from 'argon2';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

async function login(email: string, password: string) {
  console.log('Login attempt:', email);

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // Increase timeout to 30 seconds
    });
    console.log('Connected to MongoDB');

    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      console.error('User not found:', email);
      throw new Error('Invalid email or password');
    }

    if (!user.active) {
      console.error('Inactive account:', email);
      throw new Error('Account is inactive');
    }

    console.log('Stored Hashed Password from DB:', user.password);
    console.log('Plaintext Password Input:', password);

    try {
      const isValidPassword = await argon2.verify(user.password, password);
      console.log('Password Verification Result:', isValidPassword);

      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      console.log('Login successful for:', email);
      return user;
    } catch (error) {
      console.error('Error during password verification:', error);
      throw new Error('Invalid email or password');
    }
  } catch (error) {
    console.error('Error during login:', error);
    throw new Error('Login error');
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Example usage
login('data@gmail.com', 'passcode').catch(console.error);
