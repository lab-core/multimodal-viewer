/**
 * Copy the environment file into the public folder and update port in angular.json
 */
import { copyFileSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CLIENT_PORT } from '../../environment.json';

const ANGULAR_JSON_PATH = join(__dirname, '../angular.json');
const ENVIRONMENT_FILE_PATH = join(__dirname, '../../environment.json');
const PUBLIC_ENVIRONMENT_FILE_PATH = join(
  __dirname,
  '../public/environment.json',
);

try {
  // Update the port in angular.json
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const angularJson: any = JSON.parse(readFileSync(ANGULAR_JSON_PATH, 'utf8'));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  angularJson['projects']['multimodal-ui']['architect']['serve']['options'][
    'port'
  ] = CLIENT_PORT;
  writeFileSync(ANGULAR_JSON_PATH, JSON.stringify(angularJson, null, 2));

  // Copy environment file in public folder
  copyFileSync(ENVIRONMENT_FILE_PATH, PUBLIC_ENVIRONMENT_FILE_PATH);

  console.log(`Environment updated`);
} catch (error) {
  console.error('Error during environment setup:', error);
  process.exit(1);
}
