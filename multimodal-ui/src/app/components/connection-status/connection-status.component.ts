import { Component, Signal } from '@angular/core';
import {
  CommunicationService,
  CommunicationStatus,
} from '../../services/communication.service';

import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-connection-status',
  imports: [MatChipsModule, MatIconModule],
  templateUrl: './connection-status.component.html',
  styleUrl: './connection-status.component.css',
})
export class ConnectionStatusComponent {
  constructor(private readonly communicationService: CommunicationService) {}

  get communicationStatusSignal(): Signal<CommunicationStatus> {
    return this.communicationService.communicationStatusSignal;
  }
}
