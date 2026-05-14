interface Config {
  port: number;
  host: string;
  mongoUri: string;
  jwtSecret: string;
  cookieSecret?: string;
  corsOrigins: boolean | string[];
  apiUrl: string;

  GMAIL_SERVICE: string;
  GMAIL_HOST: string
  GMAIL_PORT: number;
  GMAIL_AUTH_USER: string;
  GMAIL_AUTH_PASSWORD: string;
  NODE_ENV: string;

  // GCP Configuration
  PROJECT_ID: string;
  GCP_STORAGE_BUCKET: string;
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || '0.0.0.0',
  mongoUri: process.env.MONGODB_URI || 'mongodb+srv://******:*******@cluster0.0ktur.mongodb.net/hrms_production?retryWrites=true&w=majority&appName=Cluster0',
  jwtSecret: process.env.JWT_SECRET || 'your-jwt-secret-key',
  cookieSecret: process.env.COOKIE_SECRET,
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : true,
  apiUrl: process.env.API_URL || 'http://localhost:5800',

  // Email configuration
  GMAIL_SERVICE: process.env.GMAIL_SERVICE || 'default-gmail-service',
  GMAIL_HOST: process.env.GMAIL_HOST || 'default-gmail-host',
  GMAIL_PORT: process.env.GMAIL_PORT ? parseInt(process.env.GMAIL_PORT, 10) : 123,
  GMAIL_AUTH_USER: process.env.GMAIL_AUTH_USER || 'default-gmail-host',
  GMAIL_AUTH_PASSWORD: process.env.GMAIL_AUTH_PASSWORD || 'default-gmail-host',

  // App configuration
  NODE_ENV: process.env.NODE_ENV || 'default-gmail-host',

  // GCP Configuration
  PROJECT_ID: process.env.PROJECT_ID || '',
  GCP_STORAGE_BUCKET: process.env.GCP_STORAGE_BUCKET || '',

}; 