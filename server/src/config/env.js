const dotenv = require('dotenv');
const { DateTime } = require('luxon');
const { z } = require('zod');

// quiet, otherwise dotenv prints a banner on every test run
dotenv.config({ quiet: true });

// the only place process.env is read, everything else imports this frozen object
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  CLINIC_TIMEZONE: z
    .string()
    .default('Africa/Lagos')
    .refine((zone) => DateTime.local().setZone(zone).isValid, 'CLINIC_TIMEZONE is not a known IANA zone'),
});

const parsed = schema.safeParse(process.env);

// a half configured server fails in confusing places later, so it refuses to start instead
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
  console.error('\nCopy server/.env.example to server/.env and fill in the values.');
  process.exit(1);
}

const env = Object.freeze({
  nodeEnv: parsed.data.NODE_ENV,
  port: parsed.data.PORT,
  mongoUri: parsed.data.MONGO_URI,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  accessTokenTtl: parsed.data.ACCESS_TOKEN_TTL,
  refreshTokenTtlDays: parsed.data.REFRESH_TOKEN_TTL_DAYS,
  clientOrigin: parsed.data.CLIENT_ORIGIN,
  clinicTimezone: parsed.data.CLINIC_TIMEZONE,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});

module.exports = env;
