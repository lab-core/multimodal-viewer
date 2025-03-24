import {
  Component,
  computed,
  effect,
  OnDestroy,
  signal,
  Signal,
  WritableSignal,
} from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  DisplayedPassenger,
  DisplayedVehicle,
  Simulation,
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { AnimationService } from '../../services/animation.service';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { VisualizationService } from '../../services/visualization.service';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';
import { MapLayersComponent } from '../map-tiles/map-tiles.component';

export type VisualizerStatus = SimulationStatus | 'not-found' | 'disconnected';

export interface EntitySearch {
  id: string;
  displayedValue: string;
  type: 'passenger' | 'vehicle';
  entity: DisplayedPassenger | DisplayedVehicle;
}

@Component({
  selector: 'app-visualizer',
  imports: [
    SimulationControlBarComponent,
    MapLayersComponent,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatChipsModule,
    MatTooltipModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    MatExpansionModule,
    MatButtonToggleModule,
    MatTabsModule,
  ],
  providers: [VisualizationService],
  templateUrl: './visualizer.component.html',
  styleUrl: './visualizer.component.css',
})
export class VisualizerComponent implements OnDestroy {
  // MARK: Properties
  readonly simulationSignal: Signal<Simulation | null>;

  private matDialogRef: MatDialogRef<InformationDialogComponent> | null = null;

  private readonly visualizerStatusSignal: Signal<VisualizerStatus> = computed(
    () => {
      const isConnected = this.communicationService.isConnectedSignal();

      if (!isConnected) {
        return 'disconnected';
      }

      const simulation = this.simulationSignal();

      if (simulation) {
        return simulation.status;
      }
      return 'not-found';
    },
  );

  readonly displayedPassengersSignal: Signal<DisplayedPassenger[]> = computed(
    () => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.passengers).filter(
        (passenger) => passenger.notDisplayedReason === null,
      );
    },
  );

  readonly displayedVehiclesSignal: Signal<DisplayedVehicle[]> = computed(
    () => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.vehicles).filter(
        (vehicle) => vehicle.notDisplayedReason === null,
      );
    },
  );

  readonly numberOfDisplayedPassengersByStatusSignal: Signal<
    {
      status: string;
      count: number;
    }[]
  > = computed(() => {
    const environment =
      this.visualizationService.animatedSimulationEnvironmentSignal();
    if (environment === null) {
      return [];
    }

    const passengers = Object.values(environment.passengers);
    const counts: Record<string, number> = {};

    for (const passenger of passengers) {
      const status = passenger.status;
      if (passenger.notDisplayedReason !== null) {
        continue;
      }
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
    }));
  });

  readonly numberOfDisplayedVehiclesByStatusSignal: Signal<
    {
      status: string;
      count: number;
    }[]
  > = computed(() => {
    const environment =
      this.visualizationService.animatedSimulationEnvironmentSignal();
    if (environment === null) {
      return [];
    }

    const vehicles = Object.values(environment.vehicles);
    const counts: Record<string, number> = {};

    for (const vehicle of vehicles) {
      const status = vehicle.status;
      if (vehicle.notDisplayedReason !== null) {
        continue;
      }
      counts[status] = (counts[status] ?? 0) + 1;
    }

    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
    }));
  });

  readonly notDisplayedPassengersSignal: Signal<DisplayedPassenger[]> =
    computed(() => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.passengers).filter(
        (passenger) => passenger.notDisplayedReason !== null,
      );
    });

  readonly notDisplayedVehiclesSignal: Signal<DisplayedVehicle[]> = computed(
    () => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.vehicles).filter(
        (vehicle) => vehicle.notDisplayedReason !== null,
      );
    },
  );

  readonly selectedPassengerSignal: Signal<DisplayedPassenger | null> =
    computed(() => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();
      const selectedPassengerId = this.selectedPassengerIdSignal();

      if (environment === null || selectedPassengerId === null) {
        return null;
      }

      return environment.passengers[selectedPassengerId] ?? null;
    });

  readonly selectedVehicleSignal: Signal<DisplayedVehicle | null> = computed(
    () => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();
      const selectedVehicleId = this.selectedVehicleIdSignal();

      if (environment === null || selectedVehicleId === null) {
        return null;
      }

      return environment.vehicles[selectedVehicleId] ?? null;
    },
  );

  readonly selectedPassengerVehicleSignal: Signal<DisplayedVehicle | null> =
    computed(() => {
      const selectedPassenger = this.selectedPassengerSignal();
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (
        selectedPassenger === null ||
        selectedPassenger.vehicleId === null ||
        environment === null
      ) {
        return null;
      }

      const selectedVehicle = environment.vehicles[selectedPassenger.vehicleId];

      return selectedVehicle ?? null;
    });

  readonly selectedVehiclePassengersSignal: Signal<DisplayedPassenger[]> =
    computed(() => {
      const selectedVehicle = this.selectedVehicleSignal();
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();

      if (selectedVehicle === null || environment === null) {
        return [];
      }

      const passengers = Object.values(environment.passengers).filter(
        (passenger) =>
          passenger.vehicleId !== null &&
          selectedVehicle.passengers.includes(passenger.id),
      );

      return passengers;
    });

  readonly entitySearchDataSignal: Signal<EntitySearch[]> = computed(() => {
    const environment =
      this.visualizationService.animatedSimulationEnvironmentSignal();
    if (environment === null) {
      return [];
    }

    const passengers = Object.values(environment.passengers).map(
      (passenger) => ({
        id: passenger.id,
        displayedValue: `[PASSENGER] ${passenger.id}`,
        type: 'passenger' as const,
        entity: passenger,
      }),
    );

    const vehicles = Object.values(environment.vehicles).map((vehicle) => ({
      id: vehicle.id,
      displayedValue: `[VEHICLE] ${vehicle.id}`,
      type: 'vehicle' as const,
      entity: vehicle,
    }));

    return [...passengers, ...vehicles];
  });

  readonly tabControl: FormControl<string | null>;
  showSearch = false;
  showFilter = false;
  showLayers = false;

  readonly searchValueSignal: WritableSignal<string | EntitySearch> =
    signal('');

  readonly searchControl: FormControl<string | EntitySearch | null>;

  readonly filteredEntitySearchDataSignal: Signal<
    {
      id: string;
      displayedValue: string;
      type: 'passenger' | 'vehicle';
      entity: DisplayedPassenger | DisplayedVehicle;
    }[]
  > = computed(() => {
    const searchValue = this.searchValueSignal();
    const entitySearchData = this.entitySearchDataSignal();

    if (searchValue === '') {
      return entitySearchData;
    }

    if (typeof searchValue === 'object') {
      return [searchValue];
    }

    return entitySearchData.filter((entity) =>
      entity.displayedValue.toLowerCase().includes(searchValue.toLowerCase()),
    );
  });

  readonly entitySearchDisplayFunction = (entity: {
    id: string;
    displayedValue: string;
    type: 'passenger' | 'vehicle';
    entity: DisplayedPassenger | DisplayedVehicle;
  }) => entity?.displayedValue ?? '';

  // MARK: Constructor
  constructor(
    private readonly simulationService: SimulationService,
    private readonly userInterfaceService: UserInterfaceService,
    private readonly router: Router,
    private readonly communicationService: CommunicationService,
    private readonly dialogService: DialogService,
    private readonly animationService: AnimationService,
    private readonly loadingService: LoadingService,
    private readonly visualizationService: VisualizationService,
    private readonly formBuilder: FormBuilder,
  ) {
    this.tabControl = new FormControl('');
    this.tabControl.valueChanges.subscribe((value) => {
      this.showSearch = false;
      this.showFilter = false;
      this.showLayers = false;
      if (value === 'search') this.showSearch = true;
      else if (value === 'filter') this.showFilter = true;
      else if (value === 'layers') this.showLayers = true;
    });
    this.tabControl.setValue('search');

    this.searchControl = this.formBuilder.control('');
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchValueSignal.set(value ?? '');
      console.log(value);
    });
    this.simulationSignal = this.simulationService.activeSimulationSignal;

    effect(() => {
      const searchValue = this.searchValueSignal();

      if (searchValue === null || typeof searchValue === 'string') {
        return;
      }

      if (searchValue.type === 'passenger') {
        this.selectPassenger(searchValue.id);
      } else if (searchValue.type === 'vehicle') {
        this.selectVehicle(searchValue.id);
      }
    });

    // MARK: Effects
    effect(() => {
      const isLoading = this.visualizationService.isLoadingSignal();
      if (isLoading) {
        this.loadingService.start('Loading visualization data...');
      } else {
        this.loadingService.stop();
      }
    });

    effect(() => {
      const animatedSimulationEnvironment =
        this.visualizationService.animatedSimulationEnvironmentSignal();
      if (animatedSimulationEnvironment == null) return;

      this.animationService.synchronizeEnvironment(
        animatedSimulationEnvironment,
      );
    });

    effect(() => {
      const animatedSimulationEnvironment =
        this.visualizationService.animatedSimulationEnvironmentSignal();
      const visualizationTime =
        this.visualizationService.wantedVisualizationTimeSignal();

      if (animatedSimulationEnvironment == null || visualizationTime == null)
        return;

      this.animationService.synchronizeTime(
        animatedSimulationEnvironment,
        visualizationTime,
      );
    });

    effect(() => {
      const isVisualizationPausedSignal =
        this.visualizationService.isVisualizationPausedSignal();
      this.animationService.setPause(isVisualizationPausedSignal);
    });

    effect(() => {
      const status = this.visualizerStatusSignal();

      if (this.matDialogRef) {
        const matDialogRef = this.matDialogRef;
        this.matDialogRef = null;
        matDialogRef.close(null);
      }
      this.loadingService.stop();

      switch (status) {
        case 'disconnected':
        case 'running':
        case 'paused':
          return;

        case 'not-found':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation not found',
            message:
              'The simulation you are trying to visualize is not available for now. Please verify the URL.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'completed':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation completed',
            message:
              'The simulation has been completed. You can continue the visualization or go back to the home page.',
            type: 'info',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: 'Stay here',
            canCancel: true,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'starting':
          this.loadingService.start('Starting simulation...');
          return;

        case 'stopping':
          this.loadingService.start('Stopping simulation...');
          return;

        case 'lost':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation lost',
            message:
              'The simulation you are trying to visualize has been disconnected from the server. You can continue the visualization or go back to the home page.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: 'Stay here',
            canCancel: true,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'corrupted':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Simulation corrupted',
            message: 'The file containing the simulation data is corrupted.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'outdated':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Unsupported simulation version',
            message:
              'The version of the file containing the simulation data is too old for this version of the application.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
          return;

        case 'future':
          this.matDialogRef = this.dialogService.openInformationDialog({
            title: 'Unsupported simulation version',
            message:
              'The version of the file containing the simulation data is too recent for this version of the application.',
            type: 'error',
            confirmButtonOverride: 'Back to home',
            cancelButtonOverride: null,
            canCancel: false,
          });
          void firstValueFrom(this.matDialogRef.afterClosed())
            .then(async (response) => {
              if (response !== null) {
                await this.router.navigate(['home']);
              }
            })
            .catch(console.error);
      }
    });

    effect(() => {
      const status = this.visualizerStatusSignal();

      const simulation = this.simulationSignal();
      if (!simulation) {
        return;
      }

      switch (status) {
        case 'running':
        case 'paused':
        case 'completed':
        case 'starting':
        case 'stopping':
        case 'lost':
          this.visualizationService.init(simulation);
          return;

        case 'disconnected':
        case 'not-found':
        case 'corrupted':
        case 'outdated':
        case 'future':
      }

      this.visualizationService.destroy();
    });
  }

  // MARK: Lifecycle
  ngOnDestroy() {
    this.visualizationService.destroy();
  }

  // MARK: Getters
  get statisticSignal(): Signal<
    Record<string, Record<string, Record<string, number>>>
  > {
    return computed(() => {
      const environment =
        this.visualizationService.animatedSimulationEnvironmentSignal();
      if (!environment) {
        return {};
      }
      return environment.statistic;
    });
  }

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowInformationPanelSignal;
  }

  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get selectedVehicleIdSignal(): Signal<string | null> {
    return this.animationService.selectedVehicleIdSignal;
  }

  get selectedPassengerIdSignal(): Signal<string | null> {
    return this.animationService.selectedPassengerIdSignal;
  }

  // MARK: Handlers
  hideInformationPanel() {
    this.userInterfaceService.hideInformationPanel();
  }

  showInformationPanel() {
    this.userInterfaceService.showInformationPanel();
  }

  selectPassenger(id: string) {
    this.animationService.selectEntity(id, 'passenger');
  }

  selectVehicle(id: string) {
    this.animationService.selectEntity(id, 'vehicle');
  }

  clearSearch() {
    this.searchControl.setValue(null);
  }

  pauseSimulation(id: string) {
    this.simulationService.pauseSimulation(id);
  }

  resumeSimulation(id: string) {
    this.simulationService.resumeSimulation(id);
  }

  async stopSimulation(id: string) {
    const result = await firstValueFrom(
      this.dialogService
        .openInformationDialog({
          title: 'Stopping Simulation',
          message:
            'Are you sure you want to stop the simulation? This action cannot be undone.',
          type: 'warning',
          confirmButtonOverride: null,
          cancelButtonOverride: null,
          canCancel: true,
        })
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    this.simulationService.stopSimulation(id);
  }

  async editSimulationConfiguration(simulation: Simulation) {
    const result = await firstValueFrom(
      this.dialogService
        .openSimulationConfigurationDialog({
          mode: 'edit',
          currentConfiguration: simulation.configuration,
        })
        .afterClosed(),
    );

    if (!result) {
      return;
    }

    this.simulationService.editSimulationConfiguration(
      simulation.id,
      result.configuration.maxTime,
    );
  }

  async leaveVisualization() {
    await this.router.navigate(['home']);
  }

  capitalize(str: string): string {
    if (!str) return str; // Handle empty strings
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keys(record: Record<string, any>): string[] {
    return Object.keys(record);
  }

  formatNumber(num: number): string {
    const formatter = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      useGrouping: true,
    });

    return formatter.format(num).replace(/,/g, ' ')
  }
}
