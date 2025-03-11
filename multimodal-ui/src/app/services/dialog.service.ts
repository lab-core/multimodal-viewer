import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  InformationDialogComponent,
  InformationDialogData,
  InformationDialogResult,
} from '../components/information-dialog/information-dialog.component';
import {
  SimulationConfigurationDialogComponent,
  SimulationConfigurationDialogData,
  SimulationConfigurationDialogResult,
} from '../components/simulation-configuration-dialog/simulation-configuration-dialog.component';
import {
  SimulationListDialogComponent,
  SimulationListDialogData,
  SimulationListDialogResult,
} from '../components/simulation-list-dialog/simulation-list-dialog.component';

@Injectable({
  providedIn: 'root',
})
export class DialogService {
  constructor(private readonly matDialog: MatDialog) {}

  openSimulationConfigurationDialog(
    data: SimulationConfigurationDialogData,
  ): MatDialogRef<
    SimulationConfigurationDialogComponent,
    SimulationConfigurationDialogResult
  > {
    return this.matDialog.open<
      SimulationConfigurationDialogComponent,
      SimulationConfigurationDialogData,
      SimulationConfigurationDialogResult
    >(SimulationConfigurationDialogComponent, {
      data,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
      minWidth: '600px',
    });
  }

  openSimulationListDialog(): MatDialogRef<
    SimulationListDialogComponent,
    SimulationListDialogResult
  > {
    return this.matDialog.open<
      SimulationListDialogComponent,
      SimulationListDialogData,
      SimulationListDialogResult
    >(SimulationListDialogComponent, {
      data: null,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
      minWidth: '600px',
    });
  }

  openInformationDialog(
    data: InformationDialogData,
  ): MatDialogRef<InformationDialogComponent, InformationDialogResult> {
    return this.matDialog.open<
      InformationDialogComponent,
      InformationDialogData,
      InformationDialogResult
    >(InformationDialogComponent, {
      data,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
      width: '500px',
    });
  }
}
