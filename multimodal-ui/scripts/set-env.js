const fs = require('fs');
const path = require('path');

// Path to root .env file
const envPath = path.join(__dirname, '../../.env');
// Path to Angular environment files
const targetPath = path.join(__dirname, '../src/environments/environment.ts');
const targetProdPath = path.join(__dirname, '../src/environments/environment.prod.ts');
// Path to angular.json
const angularJsonPath = path.join(__dirname, '../angular.json');

// Read .env file
const envConfig = fs.readFileSync(envPath, 'utf8');

// Parse ports from .env
const portServerMatch = envConfig.match(/PORT_SERVER=(\d+)/);
const PORT_SERVER = portServerMatch ? portServerMatch[1] : '8089';
const portClientMatch = envConfig.match(/PORT_CLIENT=(\d+)/);
const PORT_CLIENT = portClientMatch ? portClientMatch[1] : '8085';

// Update environment files
const envContent = `export const environment = {
  production: false,
  socketUrl: 'http://127.0.0.1:${PORT_SERVER}',
  clientPort: ${PORT_CLIENT}
};
`;

const envProdContent = `export const environment = {
  production: true,
  socketUrl: 'http://127.0.0.1:${PORT_SERVER}',
  clientPort: ${PORT_CLIENT}
};
`;

// Create environments directory if it doesn't exist
if (!fs.existsSync(path.dirname(targetPath))) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

// Write environment files
fs.writeFileSync(targetPath, envContent);
fs.writeFileSync(targetProdPath, envProdContent);

// Update angular.json
const angularJson = JSON.parse(fs.readFileSync(angularJsonPath, 'utf8'));
angularJson.projects['multimodal-ui'].architect.serve.options.port = parseInt(PORT_CLIENT);
fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2));

console.log(`Configuration updated:
- Socket server URL: http://127.0.0.1:${PORT_SERVER}
- Client port: ${PORT_CLIENT}`);