// Environment is loaded in window.environment
const jsonEnvironment = (
  window as unknown as {
    environment: {
      SERVER_PORT: string;
      HOST: string;
      SIMULATION_SAVE_FILE_SEPARATOR: string;
      DEBUG_TASKS: string;
      MAX_STATES_EXTRACTION_CONCURRENT_TASKS: string;
    };
  }
).environment;

const SERVER_PORT = jsonEnvironment.SERVER_PORT;
const HOST = jsonEnvironment.HOST;
export const SIMULATION_SAVE_FILE_SEPARATOR =
  jsonEnvironment.SIMULATION_SAVE_FILE_SEPARATOR;
export const DEBUG_TASKS = jsonEnvironment.DEBUG_TASKS === 'true';
export const MAX_STATES_EXTRACTION_CONCURRENT_TASKS = Number(
  jsonEnvironment.MAX_STATES_EXTRACTION_CONCURRENT_TASKS,
);

export const environment = {
  socketUrl: `http://${HOST}:${SERVER_PORT}`,
  apiUrl: `http://${HOST}:${SERVER_PORT}/api/`,
};
