import { Component } from '@angular/core';
import { CommunicationService } from '../../services/communication.service';

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

  get isConnectedSignal() {
    return this.communicationService.isConnectedSignal;
  }
}
