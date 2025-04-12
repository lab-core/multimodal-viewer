const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration paths
const PATHS = {
  env: [
    path.join(__dirname, '../../.env'),      // Local development (multimodal-ui/scripts/../../.env)
    path.join(__dirname, '../../../.env'),   // Alternative local path
    '/app/.env',                            // Docker build context
    '/.env'                                 // Docker root
  ],
  angular: {
    dev: path.join(__dirname, '../src/environments/environment.ts'),
    prod: path.join(__dirname, '../src/environments/environment.prod.ts'),
    config: path.join(__dirname, '../angular.json')
  }
};

// Default values if nothing is found
const DEFAULTS = {
  PORT_SERVER: '8089',
  PORT_CLIENT: '8085'
};

// Find the first existing .env file
function locateEnvFile() {
  for (const envPath of PATHS.env) {
    if (fs.existsSync(envPath)) {
      console.log(`Using .env file at: ${envPath}`);
      return envPath;
    }
  }
  console.warn('No .env file found, using defaults or environment variables');
  return null;
}

// Get configuration values from either .env or environment variables
function getConfig() {
  const envFile = locateEnvFile();
  if (envFile) {
    require('dotenv').config({ path: envFile });
  }

  return {
    PORT_SERVER: process.env.PORT_SERVER || DEFAULTS.PORT_SERVER,
    PORT_CLIENT: process.env.PORT_CLIENT || DEFAULTS.PORT_CLIENT
  };
}

// Create environment file content
function createEnvContent(config, isProd = false) {
  return `export const environment = {
  production: ${isProd},
  socketUrl: 'http://127.0.0.1:${config.PORT_SERVER}',
  apiUrl: 'http://127.0.0.1:${config.PORT_SERVER}/api/',
  clientPort: ${config.PORT_CLIENT}
};
`;
}

// Ensure directory exists
function ensureDirectoryExists(filePath) {
  const dirname = path.dirname(filePath);
  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }
}

// Main execution
try {
  const config = getConfig();
  
  // Create environment files
  ensureDirectoryExists(PATHS.angular.dev);
  fs.writeFileSync(PATHS.angular.dev, createEnvContent(config));
  fs.writeFileSync(PATHS.angular.prod, createEnvContent(config, true));

  // Update angular.json port if file exists
  if (fs.existsSync(PATHS.angular.config)) {
    const angularJson = JSON.parse(fs.readFileSync(PATHS.angular.config, 'utf8'));
    angularJson.projects['multimodal-ui'].architect.serve.options.port = parseInt(config.PORT_CLIENT);
    fs.writeFileSync(PATHS.angular.config, JSON.stringify(angularJson, null, 2));
  }

  console.log(`Configuration updated:
- Backend URL: http://127.0.0.1:${config.PORT_SERVER}
- Client port: ${config.PORT_CLIENT}
- Production mode: ${process.env.NODE_ENV === 'production'}`);

} catch (error) {
  console.error('Error during environment setup:', error);
  process.exit(1);
}