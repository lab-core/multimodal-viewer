import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  ConfirmationDialogResult,
} from '../components/confirmation-dialog/confirmation-dialog.component';
import {
  DisconnectedDialogComponent,
  DisconnectedDialogData,
  DisconnectedDialogResult,
} from '../components/disconnected-dialog/disconnected-dialog.component';
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

  async openSimulationConfigurationDialog(
    data: SimulationConfigurationDialogData
  ): Promise<SimulationConfigurationDialogResult | undefined> {
    return await firstValueFrom(
      this.matDialog
        .open<
          SimulationConfigurationDialogComponent,
          SimulationConfigurationDialogData,
          SimulationConfigurationDialogResult
        >(SimulationConfigurationDialogComponent, {
          data,
          disableClose: true,
          autoFocus: false,
          maxWidth: '80vw',
          maxHeight: '80vh',
        })
        .afterClosed()
    );
  }

  async openSimulationListDialog(): Promise<
    SimulationListDialogResult | undefined
  > {
    return await firstValueFrom(
      this.matDialog
        .open<
          SimulationListDialogComponent,
          SimulationListDialogData,
          SimulationListDialogResult
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
  }

  async openConfirmationDialog(
    data: ConfirmationDialogData
  ): Promise<ConfirmationDialogResult> {
    return !!(await firstValueFrom(
      this.matDialog
        .open<
          ConfirmationDialogComponent,
          ConfirmationDialogData,
          ConfirmationDialogResult
        >(ConfirmationDialogComponent, {
          data,
          disableClose: true,
          autoFocus: false,
          maxWidth: '80vw',
          maxHeight: '80vh',
          width: '500px',
        })
        .afterClosed()
    ));
  }

  async openInformationDialog(data: InformationDialogData): Promise<void> {
    await firstValueFrom(
      this.matDialog
        .open<
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
        })
        .afterClosed()
    );
  }

  openDisconnectedDialog(): MatDialogRef<
    DisconnectedDialogComponent,
    DisconnectedDialogResult
  > {
    return this.matDialog.open<
      DisconnectedDialogComponent,
      DisconnectedDialogData,
      DisconnectedDialogResult
    >(DisconnectedDialogComponent, {
      data: null,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
      width: '500px',
    });
  }
}
