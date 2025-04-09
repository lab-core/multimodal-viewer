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
  keys(): string[] {
    for (const key of Object.keys(this.recursiveDict)) {
      if (this.recursiveDict[key] instanceof Array) {
        delete this.recursiveDict[key];
      }
    }
    return Object.keys(this.recursiveDict).sort((a, b) => {
      const isAObject = typeof this.recursiveDict[a] === 'object';
      const isBObject = typeof this.recursiveDict[b] === 'object';

      // Prioritize number keys (move them earlier)
      if (isAObject && !isBObject) return 1;
      if (!isAObject && isBObject) return -1;
      return 0; // Keep original order for same types
    });
  }

  formatEntry(entry: number | string): string {
    if (typeof entry === 'number') {
      const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
        useGrouping: true,
      });

      return formatter.format(entry).replace(/,/g, ' ');
    } else if (typeof entry === 'string') {
      return this.capitalize(entry)
    }
    else return ''
  }
}
