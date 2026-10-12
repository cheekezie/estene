import mongoose from 'mongoose';
import { env } from '../config/env';

mongoose.set('strictQuery', true);

export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
  });
}

export const disconnectDB = () => mongoose.disconnect();

/** Builds a case-insensitive regex from user input without letting it inject regex syntax. */
export const searchRegex = (term: string) =>
  new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
