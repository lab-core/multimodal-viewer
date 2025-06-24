import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import {
  AddMapTileDialogComponent,
  AddMapTileDialogData,
  AddMapTileDialogResult,
} from '../components/add-map-tile-dialog/add-map-tile-dialog.component';
import {
  EditMapIconsDialogComponent,
  EditMapIconsDialogData,
  EditMapIconsDialogResult,
} from '../components/edit-map-icons-dialog/edit-map-icons-dialog.component';
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
import { UserGuideComponent } from '../components/user-guide-dialog/user-guide-dialog.component';

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
      maxHeight: '80vh',
      // To avoid the dialog to change size when the content changes
      width: '600px',
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
      width: '840px',
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
      width: '600px',
    });
  }

  openAddMapTileDialog(): MatDialogRef<
    AddMapTileDialogComponent,
    AddMapTileDialogResult
  > {
    return this.matDialog.open<
      AddMapTileDialogComponent,
      AddMapTileDialogData,
      AddMapTileDialogResult
    >(AddMapTileDialogComponent, {
      data: null,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
      minWidth: '600px',
    });
  }

  openUserGuide() {
    // Calculate dimensions based on viewport
    const vh = window.innerHeight * 0.9; // 90% of viewport height
    const vw = window.innerWidth * 0.8; // 80% of viewport width
    const maxWidth = (4 / 3) * vh; // Maximum width based on height (4:3 ratio)

    // Use whichever is smaller - the 80% width or the 4:3 ratio width
    const width = Math.min(vw, maxWidth);

    return this.matDialog.open<UserGuideComponent>(UserGuideComponent, {
      width: `${width}px`,
      height: `${vh}px`,
      maxHeight: '90vh', // Fallback
      maxWidth: '80vw', // Fallback
      panelClass: 'user-guide-dialog', // For custom styling
    });
  }

  openEditMapIconsDialog(): MatDialogRef<
    EditMapIconsDialogComponent,
    EditMapIconsDialogResult
  > {
    return this.matDialog.open<
      EditMapIconsDialogComponent,
      EditMapIconsDialogData,
      EditMapIconsDialogResult
    >(EditMapIconsDialogComponent, {
      data: null,
      disableClose: true,
      autoFocus: false,
      maxWidth: '80vw',
      maxHeight: '80vh',
    });
  }
}
