import {
  Component,
  computed,
  effect,
  ElementRef,
  OnDestroy,
  signal,
  Signal,
  ViewChild,
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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  AnimatedPassenger,
  AnimatedStop,
  AnimatedVehicle,
  getId,
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { AnimationService } from '../../services/animation.service';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { VisualizationFilterService } from '../../services/visualization-filter.service';
import { VisualizationService } from '../../services/visualization.service';
import { FavoriteEntitiesComponent } from '../favorite-entities/favorite-entities.component';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { MapLayersComponent } from '../map-tiles/map-tiles.component';
import { RecursiveStatisticComponent } from '../recursive-statistic/recursive-statistic.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';
import { SimulationControlPanelComponent } from '../simulation-control-panel/simulation-control-panel.component';
import { VisualizerFilterComponent } from '../visualizer-filter/visualizer-filter.component';

export type VisualizerStatus = SimulationStatus | 'not-found' | 'disconnected';

export interface EntitySearch {
  id: string;
  displayedValue: string;
  type: 'passenger' | 'vehicle' | 'mode';
  entity: AnimatedPassenger | AnimatedVehicle | { mode: string };
}

@Component({
  selector: 'app-visualizer',
  imports: [
    SimulationControlBarComponent,
    VisualizerFilterComponent,
    FavoriteEntitiesComponent,
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
    SimulationControlPanelComponent,
    MatExpansionModule,
    MatButtonToggleModule,
    MatTabsModule,
    RecursiveStatisticComponent,
  ],
  providers: [VisualizationService, VisualizationFilterService],
  templateUrl: './visualizer.component.html',
  styleUrl: './visualizer.component.css',
})
export class VisualizerComponent implements OnDestroy {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  // MARK: Properties
  private matDialogRef: MatDialogRef<InformationDialogComponent> | null = null;
  readonly selectedModeSignal: WritableSignal<string | null> = signal(null);

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

  readonly displayedPassengersSignal: Signal<AnimatedPassenger[]> = computed(
    () => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.passengers).filter(
        (passenger) => passenger.notDisplayedReason === null,
      );
    },
  );

  readonly displayedVehiclesSignal: Signal<AnimatedVehicle[]> = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();

    if (environment === null) {
      return [];
    }

    return Object.values(environment.vehicles).filter(
      (vehicle) => vehicle.notDisplayedReason === null,
    );
  });

  readonly numberOfDisplayedPassengersByStatusSignal: Signal<
    {
      status: string;
      count: number;
    }[]
  > = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();
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
      this.visualizationService.visualizationEnvironmentSignal();
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

  readonly notDisplayedPassengersSignal: Signal<AnimatedPassenger[]> = computed(
    () => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.passengers).filter(
        (passenger) => passenger.notDisplayedReason !== null,
      );
    },
  );

  readonly notDisplayedVehiclesSignal: Signal<AnimatedVehicle[]> = computed(
    () => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (environment === null) {
        return [];
      }

      return Object.values(environment.vehicles).filter(
        (vehicle) => vehicle.notDisplayedReason !== null,
      );
    },
  );

  readonly selectedPassengerSignal: Signal<AnimatedPassenger | null> = computed(
    () => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();
      const selectedPassengerId = this.selectedPassengerIdSignal();

      if (environment === null || selectedPassengerId === null) {
        return null;
      }

      return environment.passengers[selectedPassengerId] ?? null;
    },
  );

  readonly selectedVehicleSignal: Signal<AnimatedVehicle | null> = computed(
    () => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();
      const selectedVehicleId = this.selectedVehicleIdSignal();

      if (environment === null || selectedVehicleId === null) {
        return null;
      }

      return environment.vehicles[selectedVehicleId] ?? null;
    },
  );

  readonly selectedStopSignal: Signal<AnimatedStop | null> = computed(() => {
    const selectedStopId = this.animationService.selectedStopIdSignal();
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();

    if (environment === null || selectedStopId === null) {
      return null;
    }

    return environment.stops[selectedStopId] ?? null;
  });

  readonly selectedPassengerVehicleSignal: Signal<AnimatedVehicle | null> =
    computed(() => {
      const selectedPassenger = this.selectedPassengerSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (
        selectedPassenger === null ||
        selectedPassenger.currentLeg === null ||
        selectedPassenger.currentLeg.assignedVehicleId === null ||
        environment === null
      ) {
        return null;
      }

      const selectedVehicle =
        environment.vehicles[selectedPassenger.currentLeg.assignedVehicleId];

      return selectedVehicle ?? null;
    });

  readonly selectedPassengerStopSignal: Signal<AnimatedStop | null> = computed(
    () => {
      const selectedPassenger = this.selectedPassengerSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (selectedPassenger === null || environment === null) {
        return null;
      }

      return (
        Object.values(environment.stops).find((stop) =>
          stop.passengerIds.includes(selectedPassenger.id),
        ) ?? null
      );
    },
  );

  readonly selectedVehiclePassengersSignal: Signal<AnimatedPassenger[]> =
    computed(() => {
      const selectedVehicle = this.selectedVehicleSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (selectedVehicle === null || environment === null) {
        return [];
      }

      const passengers = selectedVehicle.passengerIds.map(
        (passengerId) => environment.passengers[passengerId],
      );

      return passengers;
    });

  readonly selectedVehicleStopSignal: Signal<AnimatedStop | null> = computed(
    () => {
      const selectedVehicle = this.selectedVehicleSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (selectedVehicle === null || environment === null) {
        return null;
      }

      return (
        Object.values(environment.stops).find((stop) =>
          stop.vehicleIds.includes(selectedVehicle.id),
        ) ?? null
      );
    },
  );

  readonly selectedStopPassengersSignal: Signal<AnimatedPassenger[]> = computed(
    () => {
      const selectedStop = this.selectedStopSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (selectedStop === null || environment === null) {
        return [];
      }

      const passengers = selectedStop.passengerIds.map(
        (passengerId) => environment.passengers[passengerId],
      );

      return passengers;
    },
  );

  readonly selectedStopVehiclesSignal: Signal<AnimatedVehicle[]> = computed(
    () => {
      const selectedStop = this.selectedStopSignal();
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();

      if (selectedStop === null || environment === null) {
        return [];
      }

      const vehicles = selectedStop.vehicleIds.map(
        (vehicleId) => environment.vehicles[vehicleId],
      );

      return vehicles;
    },
  );

  readonly entitySearchDataSignal: Signal<EntitySearch[]> = computed(() => {
    const environment =
      this.visualizationService.visualizationEnvironmentSignal();
    if (environment === null) {
      return [];
    }

    const passengers = Object.values(environment.passengers).map(
      (passenger) => ({
        id: passenger.id,
        displayedValue: `[PASSENGER] ${passenger.name ? passenger.name + ' (' + passenger.id + ')' : passenger.id}`,
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
  showFavorites = false;
  showLayers = false;

  readonly informationTabControl: FormControl<string | null>;
  showSimulationInformation = false;
  showStatistic = false;
  showStatusAndCount = false;
  showNotDisplayedEntities = false;

  private previousSearchValue: string | EntitySearch | null = null;
  readonly searchValueSignal: WritableSignal<string | EntitySearch> = signal(
    '',
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  readonly searchControl: FormControl<string | EntitySearch | null>;

  readonly filteredEntitySearchDataSignal: Signal<EntitySearch[]> = computed(
    () => {
      const searchValue = this.searchValueSignal();
      const entitySearchData = this.entitySearchDataSignal();
      const vehicleModes = this.visualizationFilterService.vehicleModes();
      const selectedMode = this.selectedModeSignal();

      const filteredData =
        selectedMode !== null
          ? entitySearchData.filter(
              (entity) =>
                entity.type === 'vehicle' &&
                (entity.entity as AnimatedVehicle).mode === selectedMode,
            )
          : entitySearchData;

      if (
        searchValue === '' ||
        (typeof searchValue === 'object' && searchValue.type === 'mode')
      ) {
        return filteredData;
      }

      if (typeof searchValue === 'string') {
        if (searchValue.toLowerCase().startsWith('mode:')) {
          const modeFilter = searchValue.substring(5).trim().toLowerCase();
          return vehicleModes
            .filter((mode) => mode.toLowerCase().includes(modeFilter))
            .map((mode) => ({
              id: `mode:${mode}`,
              displayedValue: `[MODE] ${mode}`,
              type: 'mode' as const,
              entity: { mode },
            }));
        }

        const searchLower = searchValue.toLowerCase();
        return filteredData.filter((entity) => {
          if (entity.type === 'passenger') {
            const passenger = entity.entity as AnimatedPassenger;
            return (
              entity.displayedValue.toLowerCase().includes(searchLower) ||
              (passenger.name &&
                passenger.name.toLowerCase().includes(searchLower))
            );
          }
          return entity.displayedValue.toLowerCase().includes(searchLower);
        });
      }

      return [searchValue];
    },
  );

  readonly isSimulationRunningSignal: Signal<boolean> = computed(() => {
    const simulation = this.simulationSignal();
    return (
      simulation !== null &&
      RUNNING_SIMULATION_STATUSES.includes(simulation.status)
    );
  });

  readonly entitySearchDisplayFunction = (entity: EntitySearch) =>
    entity?.displayedValue ?? '';

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
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly formBuilder: FormBuilder,
    private readonly visualizationFilterService: VisualizationFilterService,
    private snackBar: MatSnackBar,
  ) {
    this.tabControl = new FormControl('');
    this.tabControl.valueChanges.subscribe((value) => {
      // To make tabs unselectable, we have to allow multiple options
      // but only keep the last one selected.
      const values = value as unknown as string[];
      if (values.length > 1) {
        const lastSelected = values[values.length - 1];
        this.tabControl.setValue([lastSelected] as unknown as string);
        return;
      }

      const tab = values[0];
      this.showSearch = false;
      this.showFilter = false;
      this.showFavorites = false;
      this.showLayers = false;
      if (tab === 'search') this.showSearch = true;
      else if (tab === 'filter') this.showFilter = true;
      else if (tab === 'favorites') this.showFavorites = true;
      else if (tab === 'layers') this.showLayers = true;
    });

    this.informationTabControl = new FormControl('');
    this.informationTabControl.valueChanges.subscribe((value) => {
      this.showSimulationInformation = false;
      this.showStatistic = false;
      this.showStatusAndCount = false;
      this.showNotDisplayedEntities = false;
      switch (value) {
        case 'information': {
          this.showSimulationInformation = true;
          break;
        }
        case 'statistic': {
          this.showStatistic = true;
          break;
        }
        case 'statusAndCount': {
          this.showStatusAndCount = true;
          break;
        }
        case 'notDisplayedEntities': {
          this.showNotDisplayedEntities = true;
          break;
        }
      }
    });
    this.informationTabControl.setValue('information');

    this.searchControl = this.formBuilder.control('');
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchValueSignal.set(value ?? '');
    });

    // MARK: Effects
    effect(() => {
      const searchValue = this.searchValueSignal();

      if (
        JSON.stringify(searchValue) === JSON.stringify(this.previousSearchValue)
      ) {
        return;
      }

      this.previousSearchValue = searchValue;

      if (searchValue === null || typeof searchValue === 'string') {
        return;
      }

      if (searchValue.type === 'passenger') {
        this.animationService.selectEntity(searchValue.id, 'passenger');
        this.selectedModeSignal.set(null);
      } else if (searchValue.type === 'vehicle') {
        this.animationService.selectEntity(searchValue.id, 'vehicle');
        this.selectedModeSignal.set(null);
      } else if (searchValue.type === 'mode') {
        this.selectedModeSignal.set(
          (searchValue.entity as { mode: string }).mode,
        );
        this.searchControl.setValue(searchValue, { emitEvent: false });
        setTimeout(() => {
          this.searchInput.nativeElement.click();
        });
      }
    });

    effect(() => {
      const animatedSimulationEnvironment =
        this.visualizationService.visualizationEnvironmentSignal();
      if (animatedSimulationEnvironment == null) return;

      this.animationService.synchronizeEnvironment(
        animatedSimulationEnvironment,
      );
    });

    effect(() => {
      const animatedSimulationEnvironment =
        this.visualizationService.visualizationEnvironmentSignal();
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
      const selectedPassenger = this.selectedPassengerSignal();
      const selectedVehicle = this.selectedVehicleSignal();
      const entitySearchData = this.entitySearchDataSignal();

      const selectedEntity = selectedPassenger || selectedVehicle;

      if (selectedEntity) {
        const type = selectedPassenger ? 'passenger' : 'vehicle';
        const entitySearchItem = entitySearchData.find(
          (entity) => entity.type === type && entity.id === selectedEntity.id,
        );

        if (entitySearchItem) {
          if (this.searchControl.value !== entitySearchItem) {
            this.searchControl.setValue(entitySearchItem, { emitEvent: false });
          }
          return;
        }
      }

      if (
        this.searchControl.value &&
        typeof this.searchControl.value !== 'string'
      ) {
        this.searchControl.setValue('', { emitEvent: false });
      }
    });

    // Handle the visualization status
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
        case 'completed':
        case 'stopping':
          return;

        case 'starting':
          this.loadingService.start('Starting simulation...');
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

        default:
          this.visualizationService.destroy();
      }
    });
  }

  // MARK: Lifecycle
  ngOnDestroy() {
    this.visualizationService.destroy();
  }

  // MARK: Getters
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get statisticSignal(): Signal<Record<string, any>> {
    return computed(() => {
      const environment =
        this.visualizationService.visualizationEnvironmentSignal();
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

  get simulationSignal(): Signal<Simulation | null> {
    return this.simulationService.activeSimulationSignal;
  }

  get isLoadingSignal(): Signal<boolean> {
    return this.visualizationService.isLoadingSignal;
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

  selectStop(stop: AnimatedStop) {
    const id = getId(stop);
    this.animationService.selectEntity(id, 'stop');
  }

  /** Favorite Entitites */
  toggleFavoriteVehicle(id: string, name: string) {
    this.favoriteEntitiesService.toggleFavoriteVehicle(id, name);
  }

  toggleFavoritePassenger(id: string, name: string | null) {
    this.favoriteEntitiesService.toggleFavoritePassenger(id, name ?? id);
  }

  toggleFavoriteStop(stop: AnimatedStop) {
    this.favoriteEntitiesService.toggleFavoriteStop(getId(stop));
  }

  isFavoriteVehicle(id: string) {
    return this.favoriteEntitiesService.favVehicleIds().has(id);
  }

  isFavoritePassenger(id: string) {
    return this.favoriteEntitiesService.favPassengerIds().has(id);
  }

  isFavoriteStop(stop: AnimatedStop) {
    return this.favoriteEntitiesService.favStopIds().has(getId(stop));
  }
  /** ***************** */

  clearSearch() {
    this.selectedModeSignal.set(null);
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
      result.configuration.maxDuration,
    );
  }

  async leaveVisualization() {
    await this.router.navigate(['home']);
  }

  onSearchInputClick() {
    const currentValue = this.searchValueSignal();
    if (typeof currentValue === 'object' && currentValue.type === 'mode') {
      return;
    }
    this.searchControl.setValue(null);
    this.animationService.unselectEntity();
  }

  copyToClipboard(text: string): void {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        this.snackBar.open('Copied to clipboard!', 'Close', {
          duration: 2000,
        });
      })
      .catch((err) => {
        console.error('Failed to copy text: ', err);
        this.snackBar.open('Failed to copy!', 'Close', {
          duration: 2000,
        });
      });
  }

  truncateId(id: string): string {
    const maxLength = 20;
    return id.length > maxLength ? `${id.slice(0, maxLength)}...` : id;
  }
}
