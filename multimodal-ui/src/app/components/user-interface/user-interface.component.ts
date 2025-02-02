import { Component, Signal } from '@angular/core';
import {
  UserInterfaceService,
  UserInterfaceView,
} from '../../services/user-interface.service';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { DialogService } from '../../services/dialog.service';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';

@Component({
  selector: 'app-user-interface',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    SimulationControlBarComponent,
  ],
  templateUrl: './user-interface.component.html',
  styleUrl: './user-interface.component.css',
})
export class UserInterfaceComponent {
  constructor(
    private readonly userInterfaceService: UserInterfaceService,
    private readonly dialogService: DialogService
  ) {
    this.userInterfaceService.navigateToSimulation();
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

  get shouldShowControlBarSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowControlBarSignal;
  }

  hideInformationPanel() {
    this.userInterfaceService.hideInformationPanel();
  }

  showInformationPanel() {
    this.userInterfaceService.showInformationPanel();
  }

  async onStartSimulation() {
    this.userInterfaceService.hideMainMenu();

    const result = await this.dialogService.openSimulationConfigurationDialog({
      mode: 'start',
      currentConfiguration: null,
    });

    if (!result) {
      this.userInterfaceService.showMainMenu();
      return;
    }

    // TODO Start simulation
    this.userInterfaceService.navigateToSimulation();
  }

  async onBrowseSimulations() {
    this.userInterfaceService.hideMainMenu();

    const result = await this.dialogService.openSimulationListDialog();

    if (!result) {
      this.userInterfaceService.showMainMenu();
      return;
    }

    // TODO
  }
}
