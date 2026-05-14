import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../src/models/user.model';

dotenv.config();

const verifyUser = async () => {
  try {
    console.log(process.env.MONGODB_URI, 'URI is ==>>');
    await mongoose.connect(process.env.MONGODB_URI!);

    const user = await User.findOne({ email: 'data@gmail.com' }).select('+password');
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    console.log('Fetched User:', user);
    console.log('Stored Hashed Password:', user.password);

    process.exit(0);
  } catch (error) {
    console.error('Error verifying user:', error);
    process.exit(1);
  }
};

verifyUser();