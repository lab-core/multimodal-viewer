import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import {
  Simulation,
  SIMULATION_STATUSES,
  SimulationStatus,
  STATUSES_ORDER,
} from '../interfaces/simulation.model';
import { CommunicationService } from './communication.service';

@Injectable({
  providedIn: 'root',
})
export class DataService {
  // MARK: Properties
  private readonly _simulationsSignal: WritableSignal<Simulation[]> = signal(
    [],
  );

  private readonly _availableSimulationDataSignal: WritableSignal<string[]> =
    signal([]);

  // MARK: Constructor
  constructor(private readonly communicationService: CommunicationService) {
    this.listen();

    this.query();

    this.communicationService.onConnect(() => {
      this.query();
    });
  }

  // MARK: Getters
  get simulationsSignal(): Signal<Simulation[]> {
    return computed(() =>
      this._simulationsSignal().sort(this.sortSimulations.bind(this)),
    );
  }

  get availableSimulationDataSignal(): Signal<string[]> {
    return this._availableSimulationDataSignal;
  }

  // MARK: Communication
  queryAvailableData() {
    this.communicationService.emit('get-available-data');
  }

  private listen() {
    this.communicationService.on('simulations', (simulations) => {
      this._simulationsSignal.set(
        this.extractSimulations(simulations as Simulation[]),
      );
    });

    this.communicationService.on('available-data', (availableData) => {
      this._availableSimulationDataSignal.set(
        (availableData as string[]).sort(),
      );
    });

    // TODO Uncomment for debugging
    // this.communicationService.on('log', (data) => {
    //   console.debug(data);
    // });
  }

  private query() {
    this.querySimulations();
    this.queryAvailableData();
  }

  private querySimulations() {
    this.communicationService.emit('get-simulations');
  }

  // MARK: Extraction
  /**
   * Validate and extract simulation from the raw data.
   */
  private extractSimulations(data: Simulation[]): Simulation[] {
    return data
      .map((rawSimulation) => {
        // TODO Uncomment for debugging
        // console.debug('Extracting simulation: ', rawSimulation);

        if (!rawSimulation) {
          console.error('Invalid simulation data: ', rawSimulation);
          return null;
        }

        const id = rawSimulation.id;
        if (!id) {
          console.error('Simulation ID not found: ', id);
          return null;
        }

        const status: SimulationStatus = rawSimulation.status;
        if (!status) {
          console.error('Simulation status not found: ', status);
          return null;
        }
        if (!SIMULATION_STATUSES.includes(status)) {
          console.error('Simulation status not recognized: ', status);
          return null;
        }

        if (status === 'corrupted') {
          return {
            id,
            name: id.split('-')[2] ?? 'unknown',
            data: 'unknown',
            status,
            startTime: new Date(),
            simulationStartTime: null,
            simulationEndTime: null,
            simulationTime: null,
            simulationEstimatedEndTime: null,
            lastUpdateOrder: null,
            completion: 1,
            configuration: {
              maxDuration: null,
            },
            polylinesVersion: -1,
          };
        }

        const name: string = rawSimulation.name;
        if (!name) {
          console.error('Simulation name not found: ', name);
          return null;
        }

        const data: string = rawSimulation.data;
        if (!data) {
          console.error('Simulation data not found: ', data);
          return null;
        }

        const rawStartTime: string =
          rawSimulation.startTime as unknown as string;
        if (!rawStartTime) {
          console.error(`Simulation start time not found: ${rawStartTime}`);
          return null;
        }

        // Verify the format of the start time
        if (!/^\d{8}-\d{9}$/.test(rawStartTime)) {
          console.error(`Invalid format for start time: ${rawStartTime}`);
          return null;
        }

        const year: number = parseInt(rawStartTime.slice(0, 4));
        const month: number = parseInt(rawStartTime.slice(4, 6)) - 1;
        const day: number = parseInt(rawStartTime.slice(6, 8));
        const hours: number = parseInt(rawStartTime.slice(9, 11));
        const minutes: number = parseInt(rawStartTime.slice(11, 13));
        const seconds: number = parseInt(rawStartTime.slice(13, 15));
        const milliseconds: number = parseInt(rawStartTime.slice(16, 19));

        const startTime: Date = new Date(
          year,
          month,
          day,
          hours,
          minutes,
          seconds,
          milliseconds,
        );

        const simulationStartTime: number | null =
          rawSimulation.simulationStartTime ?? null;

        const simulationEndTime: number | null =
          rawSimulation.simulationEndTime ?? null;

        const simulationTime = rawSimulation.simulationTime ?? null;

        const simulationEstimatedEndTime =
          rawSimulation.simulationEstimatedEndTime ?? null;

        const lastUpdateOrder = rawSimulation.lastUpdateOrder ?? null;

        let completion = 1;
        if (
          simulationStartTime !== null &&
          simulationTime !== null &&
          simulationEstimatedEndTime !== null
        ) {
          completion =
            (simulationTime - simulationStartTime) /
            (simulationEstimatedEndTime - simulationStartTime);
        }

        const maxDuration = rawSimulation.configuration?.maxDuration ?? null;

        const polylinesVersion = rawSimulation.polylinesVersion ?? -1;

        return {
          id,
          name,
          data,
          status,
          startTime,
          simulationStartTime,
          simulationEndTime,
          simulationTime,
          simulationEstimatedEndTime,
          lastUpdateOrder,
          completion,
          configuration: {
            maxDuration,
          },
          polylinesVersion,
        };
      })
      .filter((simulation) => !!simulation);
  }

  private sortSimulations(a: Simulation, b: Simulation): number {
    // First compare the orders
    const aOrder = STATUSES_ORDER[a.status];
    const bOrder = STATUSES_ORDER[b.status];

    if (aOrder < bOrder) {
      return -1;
    }
    if (aOrder > bOrder) {
      return 1;
    }

    // If the orders are the same, compare the start times
    if (a.startTime < b.startTime) {
      return 1;
    }
    return -1;
  }
}
