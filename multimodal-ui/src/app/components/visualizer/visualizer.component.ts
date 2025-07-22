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
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  getPassengerCurrentStopIdWithVehicleId,
  getPassengerCurrentVehicleId,
  isPassengerAtStop,
  isPassengerOnVehicle,
  Passenger,
} from '../../interfaces/passenger.model';
import {
  RUNNING_SIMULATION_STATUSES,
  Simulation,
  SimulationStatus,
} from '../../interfaces/simulation.model';
import { Stop } from '../../interfaces/stop.model';
import { getAllStops, Vehicle } from '../../interfaces/vehicle.model';
import { AnimationService } from '../../services/animation.service';
import { CommunicationService } from '../../services/communication.service';
import { DialogService } from '../../services/dialog.service';
import { LoadingService } from '../../services/loading.service';
import { SimulationService } from '../../services/simulation.service';
import { TaskService } from '../../services/task.service';
import { UserInterfaceService } from '../../services/user-interface.service';
import { VisualizationFilterService } from '../../services/visualization-filter.service';
import { VisualizationService } from '../../services/visualization.service';
import { ClickHistoryComponent } from '../click-history/click-history.component';
import { EntitiesTabComponent } from '../entities-tab/entities-tab.component';
import { FavoriteEntitiesComponent } from '../favorite-entities/favorite-entities.component';
import { InformationDialogComponent } from '../information-dialog/information-dialog.component';
import { MapLayersComponent } from '../map-tiles/map-tiles.component';
import { RecursiveStatisticsComponent } from '../recursive-statistics/recursive-statistics.component';
import { SelectedEntityTabComponent } from '../selected-entity-tab/selected-entity-tab.component';
import { SimulationControlBarComponent } from '../simulation-control-bar/simulation-control-bar.component';
import { SimulationControlPanelComponent } from '../simulation-control-panel/simulation-control-panel.component';
import { VisualizerFilterComponent } from '../visualizer-filter/visualizer-filter.component';

export type VisualizerStatus = SimulationStatus | 'not-found' | 'disconnected';

export interface EntitySearch {
  id: string;
  displayedValue: string;
  type: 'passenger' | 'vehicle' | 'mode';
  entity: Passenger | Vehicle | { mode: string };
}

@Component({
  selector: 'app-visualizer',
  imports: [
    SimulationControlBarComponent,
    VisualizerFilterComponent,
    FavoriteEntitiesComponent,
    ClickHistoryComponent,
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
    RecursiveStatisticsComponent,
    EntitiesTabComponent,
    SelectedEntityTabComponent,
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

  readonly selectedPassengerSignal: Signal<Passenger | null> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return null;
    }

    const preselectedEntity = this.animationService.preselectedEntitySignal();

    // Return null if a preselected entity is set and it is not a passenger
    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab &&
      preselectedEntity.entityType !== 'passenger'
    ) {
      return null;
    }

    let selectedPassengerId = null;

    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab
    ) {
      // If a preselected entity is set, use its ID
      selectedPassengerId = preselectedEntity.id;
    } else {
      const selectedEntity = this.animationService.selectedEntitySignal();

      // If a selected entity is set, use its ID if it is a passenger
      if (
        selectedEntity !== null &&
        selectedEntity.entityType === 'passenger'
      ) {
        selectedPassengerId = selectedEntity.id;
      }
    }

    if (selectedPassengerId == null) {
      return null;
    }

    return environment.passengers[selectedPassengerId] ?? null;
  });

  readonly selectedVehicleSignal: Signal<Vehicle | null> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return null;
    }

    const preselectedEntity = this.animationService.preselectedEntitySignal();

    // Return null if a preselected entity is set and it is not a vehicle
    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab &&
      preselectedEntity.entityType !== 'vehicle'
    ) {
      return null;
    }

    let selectedVehicleId = null;

    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab
    ) {
      // If a preselected entity is set, use its ID
      selectedVehicleId = preselectedEntity.id;
    } else {
      const selectedEntity = this.animationService.selectedEntitySignal();

      // If a selected entity is set, use its ID if it is a vehicle
      if (selectedEntity !== null && selectedEntity.entityType === 'vehicle') {
        selectedVehicleId = selectedEntity.id;
      }
    }

    if (selectedVehicleId == null) {
      return null;
    }

    return environment.vehicles[selectedVehicleId] ?? null;
  });

  readonly selectedStopSignal: Signal<Stop | null> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return null;
    }

    const preselectedEntity = this.animationService.preselectedEntitySignal();

    // Return null if a preselected entity is set and it is not a stop
    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab &&
      preselectedEntity.entityType !== 'stop'
    ) {
      return null;
    }

    let selectedStopId = null;

    if (
      preselectedEntity !== null &&
      preselectedEntity.shouldShowSelectedEntityTab
    ) {
      // If a preselected entity is set, use its ID
      selectedStopId = preselectedEntity.id;
    } else {
      const selectedEntity = this.animationService.selectedEntitySignal();

      // If a selected entity is set, use its ID if it is a stop
      if (selectedEntity !== null && selectedEntity.entityType === 'stop') {
        selectedStopId = selectedEntity.id;
      }
    }

    if (selectedStopId == null) {
      return null;
    }

    return environment.stops[selectedStopId] ?? null;
  });

  readonly selectedPassengerVehicleSignal: Signal<Vehicle | null> = computed(
    () => {
      const environment = this.visualizationService.environmentSignal();

      if (environment === null) {
        return null;
      }

      const passenger = this.selectedPassengerSignal();

      if (passenger === null) {
        return null;
      }

      const currentVehicleId = getPassengerCurrentVehicleId(
        passenger,
        environment.timestamp,
      );

      if (currentVehicleId === null) {
        return null;
      }

      return environment.vehicles[currentVehicleId] ?? null;
    },
  );

  readonly selectedPassengerStopSignal: Signal<Stop | null> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return null;
    }

    const passenger = this.selectedPassengerSignal();

    if (passenger === null) {
      return null;
    }

    const stopAndVehicleId = getPassengerCurrentStopIdWithVehicleId(
      passenger,
      environment.timestamp,
    );

    if (stopAndVehicleId === null) {
      return null;
    }

    const { stopId, vehicleId } = stopAndVehicleId;

    const vehicle = environment.vehicles[vehicleId];

    if (vehicle === undefined) {
      return null;
    }

    const allStops = getAllStops(vehicle);

    const stop = allStops.find((s) => s.id === stopId);

    if (stop === undefined) {
      return null;
    }

    return stop;
  });

  readonly selectedVehiclePassengersSignal: Signal<Passenger[]> = computed(
    () => {
      const environment = this.visualizationService.environmentSignal();

      if (environment === null) {
        return [];
      }

      const vehicle = this.selectedVehicleSignal();

      if (vehicle === null) {
        return [];
      }

      const passengers = Object.values(environment.passengers).filter(
        (passenger) =>
          isPassengerOnVehicle(passenger, vehicle.id, environment.timestamp),
      );

      return passengers;
    },
  );

  readonly selectedVehicleStopSignal: Signal<Stop | null> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return null;
    }

    const vehicle = this.selectedVehicleSignal();

    if (vehicle === null) {
      return null;
    }

    if (vehicle.currentStop === null) {
      return null;
    }

    return vehicle.currentStop;
  });

  private readonly selectedStopPassengersSignal: Signal<Passenger[]> = computed(
    () => {
      const environment = this.visualizationService.environmentSignal();

      if (environment === null) {
        return [];
      }

      const stop = this.selectedStopSignal();

      if (stop === null) {
        return [];
      }

      const passengers = Object.values(environment.passengers).filter(
        (passenger) =>
          isPassengerAtStop(passenger, stop.id, environment.timestamp),
      );

      return passengers;
    },
  );

  readonly selectedStopWaitingPassengersSignal: Signal<Passenger[]> = computed(
    () => {
      const passenger = this.selectedStopPassengersSignal();

      return passenger.filter((passenger) => passenger.status !== 'complete');
    },
  );

  readonly selectedStopCompletedPassengersSignal: Signal<Passenger[]> =
    computed(() => {
      const passengers = this.selectedStopPassengersSignal();

      return passengers.filter((passenger) => passenger.status === 'complete');
    });

  readonly selectedStopVehiclesSignal: Signal<Vehicle[]> = computed(() => {
    const environment = this.visualizationService.environmentSignal();

    if (environment === null) {
      return [];
    }

    const stop = this.selectedStopSignal();

    if (stop === null) {
      return [];
    }

    const vehicles = Object.values(environment.vehicles).filter(
      (vehicle) =>
        vehicle.currentStop !== null && vehicle.currentStop.id === stop.id,
    );

    return vehicles;
  });

  readonly entitySearchDataSignal: Signal<EntitySearch[]> = computed(() => {
    const environment = this.visualizationService.environmentSignal();
    if (environment === null) {
      return [];
    }

    const passengers = Object.values(environment.passengers).map(
      (passenger) => ({
        id: passenger.id,
        displayedValue: `[PASSENGER] ${passenger.name + ' (' + passenger.id + ')'}`,
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
  showClickHistory = false;
  showLayers = false;

  readonly informationTabControl: FormControl<string[] | null>;
  showSimulationInformation = false;
  showStatistics = false;
  showEntitiesTab = false;
  showSelectedEntityTab = false;

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
                (entity.entity as Vehicle).mode === selectedMode,
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
            const passenger = entity.entity as Passenger;
            return (
              entity.displayedValue.toLowerCase().includes(searchLower) ||
              passenger.name.toLowerCase().includes(searchLower)
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
    private readonly formBuilder: FormBuilder,
    private readonly visualizationFilterService: VisualizationFilterService,
    private readonly taskService: TaskService,
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
      this.showClickHistory = false;
      this.showLayers = false;
      if (tab === 'search') this.showSearch = true;
      else if (tab === 'filter') this.showFilter = true;
      else if (tab === 'favorites') this.showFavorites = true;
      else if (tab === 'history') this.showClickHistory = true;
      else if (tab === 'layers') this.showLayers = true;
    });

    this.informationTabControl = new FormControl(['']);
    this.informationTabControl.valueChanges.subscribe((value) => {
      if (this.informationTabControl.value !== null) {
        if (this.informationTabControl.value.length > 1) {
          this.informationTabControl.setValue([
            this.informationTabControl.value[
              this.informationTabControl.value.length - 1
            ],
          ]);
          return;
        }

        this.showSimulationInformation =
          this.informationTabControl.value[0] === 'information';
        this.showStatistics =
          this.informationTabControl.value[0] === 'statistics';
        this.showEntitiesTab =
          this.informationTabControl.value[0] === 'entities';
        this.showSelectedEntityTab =
          this.informationTabControl.value[0] === 'selectedEntity';
      }
    });

    this.searchControl = this.formBuilder.control('');
    this.searchControl.valueChanges.subscribe((value) => {
      this.searchValueSignal.set(value ?? '');
    });

    // MARK: Effects
    effect(() => {
      const preselectedEntity = this.animationService.preselectedEntitySignal();

      const selectedPassenger = this.selectedPassengerSignal();
      const selectedVehicle = this.selectedVehicleSignal();
      const selectedStop = this.selectedStopSignal();

      if (
        // If no preselected entity is set, close the selected entity tab
        this.showSelectedEntityTab &&
        selectedPassenger === null &&
        selectedVehicle === null &&
        selectedStop === null
      ) {
        this.informationTabControl.setValue(['']);
      } else if (
        // If the selected entity tab is not shown and an entity is selected,
        // show the selected entity tab
        !this.showSelectedEntityTab &&
        (selectedPassenger !== null ||
          selectedVehicle !== null ||
          selectedStop !== null) &&
        // Only if the entity is not preselected or if it should show the selected entity tab
        (preselectedEntity === null ||
          preselectedEntity.shouldShowSelectedEntityTab)
      ) {
        this.informationTabControl.setValue(['selectedEntity']);
      }
    });

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
        this.animationService.selectEntity(searchValue.entity as Passenger);
        this.selectedModeSignal.set(null);
      } else if (searchValue.type === 'vehicle') {
        this.animationService.selectEntity(searchValue.entity as Vehicle);
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
  get statisticsSignal(): Signal<Record<string, any>> {
    return computed(() => {
      const environment = this.visualizationService.environmentSignal();
      if (!environment) {
        return {};
      }
      return environment.statistics;
    });
  }

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this.userInterfaceService.shouldShowInformationPanelSignal;
  }

  get isInitializedSignal(): Signal<boolean> {
    return this.visualizationService.isInitializedSignal;
  }

  get simulationSignal(): Signal<Simulation | null> {
    return this.simulationService.activeSimulationSignal;
  }

  get isLoadingSignal(): Signal<boolean> {
    return this.visualizationService.isLoadingSignal;
  }

  // MARK: Handlers
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
}
