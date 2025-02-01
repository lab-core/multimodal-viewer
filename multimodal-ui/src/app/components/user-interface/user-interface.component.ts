import { Component, Signal } from '@angular/core';
import { UserInterfaceService } from '../../services/user-interface.service';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import {
  SimulationConfigurationDialogComponent,
  SimulationConfigurationDialogData,
  SimulationConfigurationDialogResult,
} from '../simulation-configuration-dialog/simulation-configuration-dialog.component';

@Component({
  selector: 'app-user-interface',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './user-interface.component.html',
  styleUrl: './user-interface.component.css',
})
export class UserInterfaceComponent {
  constructor(
    private readonly userInterfaceService: UserInterfaceService,
    private readonly matDialog: MatDialog
  ) {
    this.userInterfaceService.showMainMenu();
    this.userInterfaceService.dimMap();
  }

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowMainMenuSignal;
  }

  get shouldDimMapSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldDimMapSignal;
  }

  async onStartSimulation() {
    this.userInterfaceService.hideMainMenu();

    const result = await firstValueFrom(
      this.matDialog
        .open<
          SimulationConfigurationDialogComponent,
          SimulationConfigurationDialogData,
          SimulationConfigurationDialogResult
        >(SimulationConfigurationDialogComponent, {
          data: { mode: 'start', currentConfiguration: null },
          disableClose: true,
          autoFocus: false,
          maxWidth: '80vw',
          maxHeight: '80vh',
        })
        .afterClosed()
    );

    if (!result) {
      this.userInterfaceService.showMainMenu();
      return;
    }
  }
}
