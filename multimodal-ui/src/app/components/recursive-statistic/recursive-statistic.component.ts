import { Component, Input } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { Statistic } from '../../interfaces/simulation.model';

@Component({
  selector: 'app-recursive-statistic',
  imports: [MatExpansionModule],
  templateUrl: './recursive-statistic.component.html',
  styleUrl: './recursive-statistic.component.css',
})
export class RecursiveStatisticComponent {
  @Input() recursiveDict: Statistic;

  constructor() {
    this.recursiveDict = {};
  }

  capitalize(str: string): string {
    if (!str) return str; // Handle empty strings
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keys(record: Record<string, any>): string[] {
    return Object.keys(record);
  }

  formatNumber(num: number): string {
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      useGrouping: true,
    });

    return formatter.format(num).replace(/,/g, ' ');
  }
}
