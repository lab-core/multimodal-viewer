import { Component, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ClickHistoryService,
  HistoryItem,
} from '../../services/click-history.service';
@Component({
  selector: 'app-click-history',
  imports: [MatCardModule, MatChipsModule, MatIconModule, MatTooltipModule],
  templateUrl: './click-history.component.html',
  styleUrl: './click-history.component.scss',
})
export class ClickHistoryComponent {
  history: Signal<HistoryItem[]>;

  constructor(private readonly clickHistoryService: ClickHistoryService) {
    this.clickHistoryService.clearHistory();
    this.history = this.clickHistoryService.clickHistory;
  }
}
