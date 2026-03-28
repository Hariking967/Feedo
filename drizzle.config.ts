import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Load Next.js-style env files when running drizzle-kit outside Next runtime.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

if (!process.env.DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL. Add it to .env.local or .env before running drizzle-kit.'
  );
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});