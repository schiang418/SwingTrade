require('dotenv').config();

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './server/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
};
