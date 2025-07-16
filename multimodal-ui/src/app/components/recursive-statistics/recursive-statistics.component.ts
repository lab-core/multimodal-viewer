import { Component, Input } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { Statistics } from '../../interfaces/statistics.model';

@Component({
  selector: 'app-recursive-statistics',
  imports: [MatExpansionModule],
  templateUrl: './recursive-statistics.component.html',
  styleUrl: './recursive-statistics.component.css',
})
export class RecursiveStatisticsComponent {
  @Input() recursiveDict: Statistics;

  constructor() {
    this.recursiveDict = {};
  }

  capitalize(str: string): string {
    if (!str) return str; // Handle empty strings
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

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
      return this.capitalize(entry);
    } else return '';
  }

  isStatistics(value: unknown): value is Statistics {
    return typeof value === 'object';
  }

  isGeneric(value: unknown): boolean {
    return typeof value === 'string' || typeof value === 'number';
  }
}
