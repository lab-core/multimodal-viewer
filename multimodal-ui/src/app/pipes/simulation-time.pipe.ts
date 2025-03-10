import { Pipe, PipeTransform } from '@angular/core';
import { simulationTimeDisplay } from '../utils/simulation-time.utils';

@Pipe({
  name: 'simulationTime',
})
export class SimulationTimePipe implements PipeTransform {
  transform(value: number): string {
    return simulationTimeDisplay(value);
  }
}
