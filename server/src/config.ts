export const config = {
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  dataDir: process.env['DATA_DIR'] ?? './data',
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
  isProduction: process.env['NODE_ENV'] === 'production',
} as const;
