import { Component, Signal } from '@angular/core';
import {
  UserInterfaceService,
  UserInterfaceView,
} from '../../services/user-interface.service';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import {
  SimulationConfigurationDialogComponent,
  SimulationConfigurationDialogData,
  SimulationConfigurationDialogResult,
} from '../simulation-configuration-dialog/simulation-configuration-dialog.component';
import { SimulationListDialogComponent } from '../simulation-list-dialog/simulation-list-dialog.component';

@Component({
  selector: 'app-user-interface',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
  ],
  templateUrl: './user-interface.component.html',
  styleUrl: './user-interface.component.css',
})
export class UserInterfaceComponent {
  constructor(
    private readonly userInterfaceService: UserInterfaceService,
    private readonly matDialog: MatDialog
  ) {
    this.userInterfaceService.navigateToMainMenu();
  }

  get currentViewSignal(): Signal<UserInterfaceView> {
    return this.userInterfaceService.viewSignal;
  }

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowMainMenuSignal;
  }

  get shouldDimMapSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldDimMapSignal;
  }

  get shouldShowSearchBarSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowSearchBarSignal;
  }

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowInformationPanelSignal;
  }

  hideInformationPanel() {
    this.userInterfaceService.hideInformationPanel();
  }

  showInformationPanel() {
    this.userInterfaceService.showInformationPanel();
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

    // TODO Start simulation
    this.userInterfaceService.navigateToSimulation();
  }

  async onBrowseSimulations() {
    this.userInterfaceService.hideMainMenu();

    const result = await firstValueFrom(
      this.matDialog
        .open<
          SimulationListDialogComponent,
          SimulationConfigurationDialogData,
          SimulationConfigurationDialogResult
        >(SimulationListDialogComponent, {
          data: null,
          disableClose: true,
          autoFocus: false,
          maxWidth: '80vw',
          maxHeight: '80vh',
          minWidth: '30vw',
        })
        .afterClosed()
    );

    if (!result) {
      this.userInterfaceService.showMainMenu();
      return;
    }

    // TODO
  }
}
