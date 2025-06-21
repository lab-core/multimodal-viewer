// Environment is loaded in window.environment
const jsonEnvironment = (
  window as unknown as {
    environment: {
      SERVER_PORT: string;
      HOST: string;
    };
  }
).environment;

const SERVER_PORT = jsonEnvironment.SERVER_PORT;
const HOST = jsonEnvironment.HOST;

export const environment = {
  socketUrl: `:${SERVER_PORT}/`,
  apiUrl: `http://${HOST}:${SERVER_PORT}/api/`,
};
