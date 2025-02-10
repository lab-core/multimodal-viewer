import { Component, effect, Signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Simulation } from '../../interfaces/simulation.model';
import { AnimationService } from '../../services/animation.service';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { SimulationService } from '../../services/simulation.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';

@Component({
  selector: 'app-visualizer',
  imports: [
    SimulationControlBarComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './visualizer.component.html',
  styleUrl: './visualizer.component.css',
})
export class VisualizerComponent {
  readonly simulationSignal: Signal<Simulation | null>;

  private matDialogRef: MatDialogRef<InformationDialogComponent> | null = null;

  constructor(
    private readonly simulationService: SimulationService,
    private readonly userInterfaceService: UserInterfaceService,
    private readonly router: Router,
    private readonly communicationService: CommunicationService,
    private readonly dialogService: DialogService,
    private readonly animationService: AnimationService,
  ) {
    this.simulationSignal = this.simulationService.activeSimulationSignal;

    // Check if the simulation is available
    effect(() => {
      const isConnected = this.communicationService.isConnectedSignal();

      if (!isConnected) {
        if (this.matDialogRef) {
          this.matDialogRef.close();
          this.matDialogRef = null;
        }
        return;
      }

      const simulation = this.simulationSignal();

      if (simulation) {
        if (this.matDialogRef) {
          this.matDialogRef.close();
          this.matDialogRef = null;
        }
        return;
      }

      if (!this.matDialogRef) {
        this.matDialogRef = this.dialogService.openInformationDialog({
          title: 'Simulation not found',
          message:
            'The simulation you are trying to visualize is not available for now. Either the simulation is currently being loaded or it does not exist. Please verify the URL.',
          type: 'warning',
          closeButtonOverride: 'Back to home',
        });

        void firstValueFrom(this.matDialogRef.afterClosed())
          .then(async () => {
            if (this.matDialogRef) {
              await this.router.navigate(['home']);
            }
          })
          .catch((error) => {
            console.error(error);
          });
      }
    });

    effect(() => {
      const simulationEnvironment =
        this.simulationService.simulationEnvironmentSignal();

      console.log(
        'Number of passengers: ',
        Object.values(simulationEnvironment.passengers).length,
      );
      console.log(
        'Number of vehicles: ',
        Object.values(simulationEnvironment.vehicles).length,
      );
      console.log(
        'Number of vehicles with position: ',
        Object.values(simulationEnvironment.vehicles).filter(
          (vehicle) => vehicle.latitude && vehicle.longitude,
        ).length,
      );

      const specificVehicle = Object.values(
        simulationEnvironment.vehicles,
      ).find((vehicle) => vehicle.id === '2794576');
      if (specificVehicle) {
        console.warn(
          'Specific vehicle: ',
          specificVehicle.status,
          specificVehicle.longitude,
          specificVehicle.latitude,
          specificVehicle,
        );
      }

      for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
        if (!vehicle.latitude || !vehicle.longitude) {
          continue;
        }

        this.animationService.setVehiclePosition(
          vehicle.id,
          vehicle.latitude,
          vehicle.longitude,
        );
      }
    });
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

  async navigateHome() {
    await this.router.navigate(['home']);
  }
}
