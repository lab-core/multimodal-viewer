import { HOST, SERVER_PORT } from '../../public/environment.json';

export const environment = {
  socketUrl: `http://${HOST}:${SERVER_PORT}`,
  apiUrl: `http://${HOST}:${SERVER_PORT}/api`,
};
