import {
  extractSimulationEnvironment,
  SimulationEnvironment,
} from './environment.model';
import { extractUpdate, Update } from './update.model';

export interface SimulationState extends SimulationEnvironment {
  updates: Update[];
}

export function extractSimulationStates(
  serializedEnvironments: unknown,
  serializedUpdates: unknown,
): SimulationState[] | null {
  // Extracting the updates
  if (typeof serializedUpdates !== 'object' || serializedUpdates === null) {
    console.error(
      'Invalid data type for serialized updates',
      serializedUpdates,
      'and environments',
      serializedEnvironments,
    );
    return null;
  }

  const updatesByFirstUpdateIndex: Record<number, Update[]> = {};
  for (const [key, value] of Object.entries(serializedUpdates)) {
    if (typeof key !== 'string') {
      console.error(
        'Invalid data type for key',
        key,
        'in serialized updates',
        serializedUpdates,
      );
      return null;
    }
    const numberKey = parseInt(key);

    if (isNaN(numberKey)) {
      console.error(
        'Invalid number key',
        key,
        'in serialized updates',
        serializedUpdates,
      );
      return null;
    }

    if (!Array.isArray(value)) {
      console.error(
        'Invalid data type for value',
        value,
        'in serialized updates',
        serializedUpdates,
      );
      return null;
    }

    const updates: Update[] = [];
    for (const serializedUpdate of value) {
      if (typeof serializedUpdate !== 'string') {
        console.error(
          'Invalid data type for serialized update',
          serializedUpdate,
          'in serialized updates',
          serializedUpdates,
        );
        return null;
      }

      const update = extractUpdate(JSON.parse(serializedUpdate));

      if (update === null) {
        console.error(
          'Invalid update',
          serializedUpdate,
          'in serialized updates',
          serializedUpdates,
        );
        return null;
      }
    }

    if (!updates.every((update) => update !== null)) {
      const firstInvalidUpdate = updates.find((update) => update === null);
      console.error(
        'Invalid updates, including',
        firstInvalidUpdate,
        'for key',
        key,
        'in serialized updates',
        serializedUpdates,
      );
      return null;
    }

    updatesByFirstUpdateIndex[numberKey] = updates;
  }

  // Extracting the states
  if (
    !Array.isArray(serializedEnvironments) ||
    !serializedEnvironments.every(
      (serializedEnvironment) => typeof serializedEnvironment === 'string',
    )
  ) {
    console.error(
      'Invalid data type for serialized environments',
      serializedEnvironments,
    );
    return null;
  }

  const states: SimulationState[] = [];
  for (const serializedEnvironment of serializedEnvironments) {
    const environment = extractSimulationEnvironment(
      JSON.parse(serializedEnvironment),
    );

    if (environment === null) {
      console.error(
        'Invalid simulation environment',
        serializedEnvironment,
        'in serialized environments',
        serializedEnvironments,
      );
      return null;
    }

    const updates = updatesByFirstUpdateIndex[environment.updateIndex];
    if (updates === undefined) {
      console.error(
        'No updates found for update index',
        environment.updateIndex,
        'in serialized updates',
        serializedUpdates,
        'and serialized environments',
        serializedEnvironments,
      );
      return null;
    }

    states.push({
      ...environment,
      updates,
    });
  }

  return states;
}
