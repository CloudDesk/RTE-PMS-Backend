declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT: string;
      HOST: string;
      MONGODB_URI: string;
      JWT_SECRET: string;
      CORS_ORIGINS: string;
      PROJECT_ID: string;
      GCP_STORAGE_BUCKET: string;
      PMS_STORAGE_PROVIDER?: 'gcp' | 'azure';
      PMS_GCP_STORAGE_BUCKET?: string;
      PMS_AZURE_STORAGE_ACCOUNT?: string;
      PMS_AZURE_STORAGE_CONTAINER?: string;
      PMS_AZURE_STORAGE_CONNECTION_STRING?: string;
      PMS_AZURE_STORAGE_ENDPOINT?: string;
      PMS_AZURE_MANAGED_IDENTITY_CLIENT_ID?: string;
      PMS_STORAGE_ALLOWED_HOSTS?: string;
      GCP_SERVICE_ACCOUNT_JSON?: string;
      GCP_CLIENT_EMAIL?: string;
      GCP_PRIVATE_KEY?: string;
      PUPPETEER_EXECUTABLE_PATH?: string;
      PUPPETEER_BROWSER_REUSE?: string;
      PUPPETEER_DEFAULT_TIMEOUT_MS?: string;
      PUPPETEER_NAVIGATION_TIMEOUT_MS?: string;
      PUPPETEER_PDF_TIMEOUT_MS?: string;
      PUPPETEER_MAX_CONCURRENT_RENDERS?: string;
      PAYSLIP_TEMP_DIR?: string;
    }
  }
}
