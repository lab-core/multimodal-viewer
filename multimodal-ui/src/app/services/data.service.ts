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
  private readonly _simulationsSignal: WritableSignal<Simulation[]> = signal(
    [],
  );

  private readonly _availableSimulationDataSignal: WritableSignal<string[]> =
    signal([]);

  constructor(private readonly communicationService: CommunicationService) {
    this.listen();

    this.query();

    this.communicationService.onConnect(() => {
      this.query();
    });
  }

  get simulationsSignal(): Signal<Simulation[]> {
    return computed(() =>
      this._simulationsSignal().sort(this.sortSimulations.bind(this)),
    );
  }

  get availableSimulationDataSignal(): Signal<string[]> {
    return this._availableSimulationDataSignal;
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
    this.communicationService.emit('get-simulations');
    this.communicationService.emit('get-available-data');
  }

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

        const id = rawSimulation['id'];
        if (!id) {
          console.error('Simulation ID not found: ', id);
          return null;
        }

        const name: string = rawSimulation['name'];
        if (!name) {
          console.error('Simulation name not found: ', name);
          return null;
        }

        const data: string = rawSimulation['data'];
        if (!data) {
          console.error('Simulation data not found: ', data);
          return null;
        }

        const status: SimulationStatus = rawSimulation['status'];
        if (!status) {
          console.error('Simulation status not found: ', status);
          return null;
        }
        if (!SIMULATION_STATUSES.includes(status)) {
          console.error('Simulation status not recognized: ', status);
          return null;
        }

        const rawStartTime: string = rawSimulation[
          'startTime'
        ] as unknown as string;
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

        return {
          id,
          name,
          data,
          status,
          startTime,
        };
      })
      .filter((simulation) => !!simulation);
  }

  refreshAvailableSimulationData() {
    this.communicationService.emit('getAvailableData');
  }

  importFolder(folderName: string, files: { name: string; content: string }[]) {
    this.communicationService.emit('importFolder', { folderName, files });
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
