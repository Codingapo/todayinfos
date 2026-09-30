export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 8787),
  appOrigin: process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 8787}`,
  jwtSecret: process.env.JWT_SECRET || 'todayinfo-dev-only-change-me',
  demoMode: String(process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false',
  demoAdminUsername: process.env.DEMO_ADMIN_USERNAME || 'apo',
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD || 'admin',
  sourceApiBase: (process.env.SOURCE_API_BASE || 'https://todayinfo-zpshgscq.manus.space/api/v1').replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL || '',
  databaseSsl: String(process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false',
  supabase: {
    url: (process.env.SUPABASE_URL1 || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'todayinfo'
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'todayinfo',
    publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  },
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'TodayInfo <noreply@example.com>'
};

if (config.nodeEnv === 'production' && config.jwtSecret.includes('dev-only')) {
  throw new Error('JWT_SECRET must be set in production.');
}
if (config.nodeEnv === 'production' && config.demoMode) {
  throw new Error('DEMO_MODE must be false in production.');
}
