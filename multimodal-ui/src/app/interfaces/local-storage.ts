const LOCAL_STORAGE_KEY = 'multimodal-viewer';

// MARK: Map
const MAP_LOCAL_STORAGE_KEY = LOCAL_STORAGE_KEY + '.map';

export const MAP_CENTER_LOCAL_STORAGE_KEY = MAP_LOCAL_STORAGE_KEY + '.center';
export const MAP_ZOOM_LOCAL_STORAGE_KEY = MAP_LOCAL_STORAGE_KEY + '.zoom';

// MARK: Visualization
const VISUALIZATION_LOCAL_STORAGE_KEY_PREFIX =
  LOCAL_STORAGE_KEY + '.visualization';

function getVisualizationLocalStorageKey(simulationId: string) {
  return VISUALIZATION_LOCAL_STORAGE_KEY_PREFIX + `.${simulationId}`;
}

const VISUALIZATION_IS_PAUSED_LOCAL_STORAGE_KEY_SUFFIX = '.is-paused';
const VISUALIZATION_SPEED_POWER_LOCAL_STORAGE_KEY_SUFFIX = '.speed-power';
const VISUALIZATION_DIRECTION_LOCAL_STORAGE_KEY_SUFFIX = '.direction';
const VISUALIZATION_TIME_LOCAL_STORAGE_KEY_SUFFIX = '.time';

function getVisualizationIsPausedLocalStorageKey(simulationId: string) {
  return (
    getVisualizationLocalStorageKey(simulationId) +
    VISUALIZATION_IS_PAUSED_LOCAL_STORAGE_KEY_SUFFIX
  );
}

export function setVisualizationIsPausedLocalStorage(
  simulationId: string,
  isPaused: boolean,
) {
  localStorage.setItem(
    getVisualizationIsPausedLocalStorageKey(simulationId),
    JSON.stringify(isPaused),
  );
}

export function getVisualizationIsPausedLocalStorage(
  simulationId: string,
): boolean | null {
  const savedIsPaused = localStorage.getItem(
    getVisualizationIsPausedLocalStorageKey(simulationId),
  );

  if (savedIsPaused === null) {
    return null;
  }

  const isPaused: unknown = JSON.parse(savedIsPaused);

  if (typeof isPaused === 'boolean') {
    return isPaused;
  }

  return null;
}

function getVisualizationSpeedPowerLocalStorageKey(simulationId: string) {
  return (
    getVisualizationLocalStorageKey(simulationId) +
    VISUALIZATION_SPEED_POWER_LOCAL_STORAGE_KEY_SUFFIX
  );
}

export function setVisualizationSpeedPowerLocalStorage(
  simulationId: string,
  speed: number,
) {
  localStorage.setItem(
    getVisualizationSpeedPowerLocalStorageKey(simulationId),
    JSON.stringify(speed),
  );
}

export function getVisualizationSpeedPowerLocalStorage(
  simulationId: string,
): number | null {
  const savedSpeed = localStorage.getItem(
    getVisualizationSpeedPowerLocalStorageKey(simulationId),
  );

  if (savedSpeed === null) {
    return null;
  }

  const speed: unknown = JSON.parse(savedSpeed);

  if (typeof speed === 'number') {
    return speed;
  }

  return null;
}

function getVisualizationDirectionLocalStorageKey(simulationId: string) {
  return (
    getVisualizationLocalStorageKey(simulationId) +
    VISUALIZATION_DIRECTION_LOCAL_STORAGE_KEY_SUFFIX
  );
}

export function setVisualizationDirectionLocalStorage(
  simulationId: string,
  direction: number,
) {
  localStorage.setItem(
    getVisualizationDirectionLocalStorageKey(simulationId),
    JSON.stringify(direction),
  );
}

export function getVisualizationDirectionLocalStorage(
  simulationId: string,
): number | null {
  const savedDirection = localStorage.getItem(
    getVisualizationDirectionLocalStorageKey(simulationId),
  );

  if (savedDirection === null) {
    return null;
  }

  const direction: unknown = JSON.parse(savedDirection);

  if (typeof direction === 'number') {
    return direction;
  }

  return null;
}

function getVisualizationTimeLocalStorageKey(simulationId: string) {
  return (
    getVisualizationLocalStorageKey(simulationId) +
    VISUALIZATION_TIME_LOCAL_STORAGE_KEY_SUFFIX
  );
}

export function setVisualizationTimeLocalStorage(
  simulationId: string,
  time: number,
) {
  localStorage.setItem(
    getVisualizationTimeLocalStorageKey(simulationId),
    JSON.stringify(time),
  );
}

export function getVisualizationTimeLocalStorage(
  simulationId: string,
): number | null {
  const savedTime = localStorage.getItem(
    getVisualizationTimeLocalStorageKey(simulationId),
  );

  if (savedTime === null) {
    return null;
  }

  const time: unknown = JSON.parse(savedTime);

  if (typeof time === 'number') {
    return time;
  }

  return null;
}
