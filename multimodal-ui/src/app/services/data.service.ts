import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import {
  Simulation,
  SIMULATION_STATUSES,
  SimulationStatus,
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
    return this._simulationsSignal;
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

    this.communicationService.on('availableData', (availableData) => {
      this._availableSimulationDataSignal.set(
        (availableData as string[]).sort(),
      );
    });

    this.communicationService.on('log', (data) => {
      console.debug(data);
    });
  }

  private query() {
    this.communicationService.emit('getSimulations');
    this.communicationService.emit('getAvailableData');
  }

  /**
   * Validate and extract simulation from the raw data.
   */
  private extractSimulations(data: Simulation[]): Simulation[] {
    return data
      .map((rawSimulation) => {
        console.debug('Extracting simulation: ', rawSimulation);

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
}
