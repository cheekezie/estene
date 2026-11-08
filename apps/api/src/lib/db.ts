import mongoose from 'mongoose';
import { env } from '../config/env';

mongoose.set('strictQuery', true);

const conn = mongoose.connection;
/** Host and database only, never the credentials in the URI. */
const where = () =>
  `${conn.host}${conn.port && !env.MONGODB_URI.startsWith('mongodb+srv') ? `:${conn.port}` : ''}/${conn.name}`;

conn.on('disconnected', () => console.warn('[mongo] disconnected'));
conn.on('reconnected', () => console.log(`[mongo] reconnected to ${where()}`));
conn.on('error', (err: Error) => console.error('[mongo]', err.message));

export async function connectDB() {
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
  });
  console.log(`[mongo] connected to ${where()}`);
}

export const disconnectDB = () => mongoose.disconnect();

/** Builds a case-insensitive regex from user input without letting it inject regex syntax. */
export const searchRegex = (term: string) =>
  new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
