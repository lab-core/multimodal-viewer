/**
 * Copy the environment file into the public folder and update port in angular.json
 */
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ANGULAR_JSON_PATH = join(__dirname, '../angular.json');
const ENVIRONMENT_FILE_PATH = join(__dirname, '../../.env');
const PUBLIC_ENVIRONMENT_FILE_PATH = join(
  __dirname,
  '../public/environment.json',
);

try {
  const environment = parse(readFileSync(ENVIRONMENT_FILE_PATH, 'utf8'));
  const CLIENT_PORT = parseInt(environment['CLIENT_PORT']);

  if (CLIENT_PORT === undefined) {
    throw new Error('CLIENT_PORT is not defined in the environment file');
  }

  // Update the port in angular.json
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const angularJson: any = JSON.parse(readFileSync(ANGULAR_JSON_PATH, 'utf8'));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  angularJson['projects']['multimodal-ui']['architect']['serve']['options'][
    'port'
  ] = CLIENT_PORT;
  writeFileSync(ANGULAR_JSON_PATH, JSON.stringify(angularJson, null, 2));

  // Write the environment variables to the public folder
  writeFileSync(PUBLIC_ENVIRONMENT_FILE_PATH, JSON.stringify(environment));

  console.log(`Environment updated`);
} catch (error) {
  console.error('Error during environment setup:', error);
  process.exit(1);
}
