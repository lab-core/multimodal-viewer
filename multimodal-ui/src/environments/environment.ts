// Environment is loaded in window.environment
const jsonEnvironment = (
  window as unknown as {
    environment: {
      SERVER_PORT: string;
      HOST: string;
      SIMULATION_SAVE_FILE_SEPARATOR: string;
    };
  }
).environment;

const SERVER_PORT = jsonEnvironment.SERVER_PORT;
const HOST = jsonEnvironment.HOST;
export const SIMULATION_SAVE_FILE_SEPARATOR =
  jsonEnvironment.SIMULATION_SAVE_FILE_SEPARATOR;

export const environment = {
  socketUrl: `:${SERVER_PORT}/`,
  apiUrl: `http://${HOST}:${SERVER_PORT}/api/`,
};
