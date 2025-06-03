import { SERVER_PORT } from '../../public/environment.json';

export const environment = {
  socketUrl: `:${SERVER_PORT}`,
  apiUrl: `:${SERVER_PORT}/api`,
};
