import 'leaflet-pixi-overlay';

import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { color as d3Color } from 'd3-color';
import { interpolateRgbBasis as d3InterpolateRgb } from 'd3-interpolate';
import * as L from 'leaflet';
import { pixiOverlay } from 'leaflet';
import { OutlineFilter } from 'pixi-filters';
import * as PIXI from 'pixi.js';
import {
  Entity,
  EntityFilterMode,
  EntityType,
} from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedStop,
  AnimatedVehicle,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  EntityMetadata,
  getAllStops,
  Polyline,
  StaticPassengerAnimationData,
  StaticVehicleAnimationData,
  Vehicle,
} from '../interfaces/simulation.model';
import { FavoriteEntitiesService } from './favorite-entities.service';
import { SpritesService } from './sprites.service';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  private readonly _selectedVehicleIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _selectedPassengerIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _selectedStopIdSignal: WritableSignal<string | null> =
    signal(null);

  private readonly _preselectedEntityIdSignal: WritableSignal<
    (EntityMetadata & { shouldShowSelectedEntityTab: boolean }) | null
  > = signal(null);

  private readonly _clickPositionSignal: WritableSignal<PIXI.Point> = signal(
    new PIXI.Point(0, 0),
  );

  private readonly _nearVehiclesSignal: WritableSignal<EntityMetadata[]> =
    signal([]);
  private readonly _nearPassengersSignal: WritableSignal<EntityMetadata[]> =
    signal([]);
  private readonly _nearStopsSignal: WritableSignal<EntityMetadata[]> = signal(
    [],
  );

  get nearVehiclesSignal(): Signal<EntityMetadata[]> {
    return this._nearVehiclesSignal;
  }

  get nearPassengersSignal(): Signal<EntityMetadata[]> {
    return this._nearPassengersSignal;
  }

  get nearStopsSignal(): Signal<EntityMetadata[]> {
    return this._nearStopsSignal;
  }

  get preselectedEntitySignal(): Signal<
    | (EntityMetadata & {
        shouldShowSelectedEntityTab: boolean;
      })
    | null
  > {
    return this._preselectedEntityIdSignal;
  }

  get selectedVehicleIdSignal(): Signal<string | null> {
    return this._selectedVehicleIdSignal;
  }

  get selectedPassengerIdSignal(): Signal<string | null> {
    return this._selectedPassengerIdSignal;
  }

  get selectedStopIdSignal(): Signal<string | null> {
    return this._selectedStopIdSignal;
  }

  get clickPositionSignal(): Signal<PIXI.Point> {
    return this._clickPositionSignal;
  }

  readonly hasSelectedEntitySignal: Signal<boolean> = computed(
    () =>
      this._selectedVehicleIdSignal() !== null ||
      this._selectedPassengerIdSignal() !== null,
  );

  private readonly MIN_LERPABLE_DESYNC_DIFF = 1.5;
  private readonly MAX_LERPABLE_DESYNC_DIFF = 900;

  private readonly WHITE = 0xffffff;
  private readonly LIGHT_RED = 0xffcdcd;
  private readonly LIGHT_BLUE = 0xcdcdff;
  private readonly SATURATED_RED = 0xcd2222;
  private readonly KELLY_GREEN = 0x028a0f;
  private readonly LIGHT_GRAY = 0x666666;

  private readonly BITMAP_TEXT_URL = 'bitmap-fonts/custom-sans-serif.xml';
  private readonly BITMAP_TEXT_STYLE: Partial<PIXI.IBitmapTextStyle> = {
    fontName: 'custom-sans-serif',
    fontSize: 18,
  };

  private pause = false;
  private animationVisualizationTime = 0;
  private lastVisualisationTime = 0;

  private hasCenteredInitially = false;

  private vehicleEntities: Entity<AnimatedVehicle>[] = [];
  private vehicleEntitiesByVehicleId: Record<string, Entity<AnimatedVehicle>> =
    {};
  private passengersEntities: Entity<AnimatedPassenger>[] = [];
  private passengerEntitiesByPassengerId: Record<
    string,
    Entity<AnimatedPassenger>
  > = {};

  private stopEntities: Entity<AnimatedStop>[] = [];
  private stopEntitiesByPosition: Record<string, Entity<AnimatedStop>> = {};

  private entitiesContainer = new PIXI.Container();
  private polylinesContainer = new PIXI.Container();
  private backgroundContainer = new PIXI.Container();
  private mainContainer = new PIXI.Container();

  private startTimestamp: number | null = null;
  private endTimestamp: number | null = null;

  private lastScale = 0;

  private utils!: L.PixiOverlayUtils;

  private selectedEntityPolylines: PIXI.Graphics[] = [];

  // Variable that are alive for a single frame (could probably improve)
  private frame_pointToFollow: L.LatLngExpression | null = null;

  private previousVehicleEntities: Entity<AnimatedVehicle>[] = [];
  private previousPassengerEntities: Entity<AnimatedPassenger>[] = [];
  private previousStopEntities: Entity<AnimatedStop>[] = [];

  // Filters
  private filters: Set<string> = new Set<string>();
  private filterMode: EntityFilterMode = 'all';
  private shouldShowComplete = false;

  private speed = 1;
  private readonly _shouldFollowEntitySignal: WritableSignal<boolean> =
    signal(false);

  get shouldFollowEntitySignal(): Signal<boolean> {
    return this._shouldFollowEntitySignal;
  }

  private highlightedLegIndex: number | null = null;

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly spritesService: SpritesService,
  ) {
    void PIXI.Assets.load(this.BITMAP_TEXT_URL);

    // Initialize containers (entities over polylines over background)
    this.mainContainer.addChild(this.backgroundContainer);
    this.mainContainer.addChild(this.polylinesContainer);
    this.mainContainer.addChild(this.entitiesContainer);
  }

  synchronizeEnvironment(simulationEnvironment: AnimatedSimulationEnvironment) {
    // We need to interpolate the animation time to quickly join the current visualization time if there is
    // a continuous animation data between the last and the current visualization time, or else
    // set the animation time to the current visualization time.
    this.synchronizeTime(
      simulationEnvironment,
      simulationEnvironment.timestamp,
    );

    this.entitiesContainer.removeChildren();
    this.backgroundContainer.removeChildren();
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
    this.previousVehicleEntities = this.vehicleEntities;
    this.previousPassengerEntities = this.passengersEntities;
    this.previousStopEntities = this.stopEntities;
    this.vehicleEntities = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};

    let isSelectedVehicleInEnvironment = false;

    this.startTimestamp = simulationEnvironment.animationData.startTimestamp;
    this.endTimestamp = simulationEnvironment.animationData.endTimestamp;

    const selectedVehicleId = this._selectedVehicleIdSignal();
    const selectedPassengerId = this._selectedPassengerIdSignal();

    for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
      this.addVehicle(vehicle);
      if (selectedVehicleId !== null && vehicle.id == selectedVehicleId) {
        isSelectedVehicleInEnvironment = true;
      }
    }

    if (selectedVehicleId !== null && !isSelectedVehicleInEnvironment) {
      this.unselectVehicle();
      console.warn(
        'The vehicle you selected is not in the environment anymore. It has been deselected.',
      );
    }

    let isSelectedPassengerInEnvironment = false;

    for (const passenger of Object.values(simulationEnvironment.passengers)) {
      this.addPassenger(passenger);
      if (selectedPassengerId !== null && passenger.id == selectedPassengerId) {
        isSelectedPassengerInEnvironment = true;
      }
    }

    if (selectedPassengerId !== null && !isSelectedPassengerInEnvironment) {
      this.unselectPassenger();
      console.warn(
        'The passenger you selected is not in the environment anymore. It has been deselected.',
      );
    }

    this.stopEntities = [];
    this.stopEntitiesByPosition = {};

    for (const stop of Object.values(simulationEnvironment.stops)) {
      this.addPassengerStop(stop);
    }

    let isSelectedStopInEnvironment = false;
    const selectedStopId = this._selectedStopIdSignal();
    for (const stop of Object.values(simulationEnvironment.stops)) {
      if (selectedStopId !== null && stop.id == selectedStopId) {
        isSelectedStopInEnvironment = true;
      }
    }

    if (selectedStopId !== null && !isSelectedStopInEnvironment) {
      this.unselectStop();
      console.warn(
        'The stop you selected is not in the environment anymore. It has been deselected.',
      );
    }

    // Call redraw to update the environment.
    this.onRedraw();
  }

  private synchronizeTime(
    animatedSimulationEnvironment: AnimatedSimulationEnvironment,
    visualizationTime: number,
  ) {
    // Don't sync if we don't have the right state
    if (animatedSimulationEnvironment.timestamp != visualizationTime) {
      console.warn(
        "Animation not synced: simulation timestamp doesn't match visualisation time",
      );
      return;
    }

    if (
      this.startTimestamp === null ||
      this.endTimestamp === null ||
      this.animationVisualizationTime < this.startTimestamp ||
      this.animationVisualizationTime > this.endTimestamp ||
      this.pause
    ) {
      this.animationVisualizationTime = visualizationTime;
    }

    this.lastVisualisationTime = visualizationTime;
  }

  private addVehicle(vehicle: AnimatedVehicle): void {
    const vehicleContainer = new PIXI.Container();
    const backgroundContainer = new PIXI.Container();

    // Vehicle background shape
    const graphics = new PIXI.Graphics();
    backgroundContainer.addChild(graphics);

    // Vehicle Icon
    const sprite = new PIXI.Sprite();
    sprite.anchor.set(0.5, 0.5);
    vehicleContainer.addChild(sprite);

    // Vehicle passenger count text
    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    vehicleContainer.addChild(passengerCountText);

    // Vehicle Passenger Icon
    const passengerIcon = new PIXI.Sprite();
    passengerIcon.anchor.set(0.5, 0.5);
    vehicleContainer.addChild(passengerIcon);

    const entity: Entity<AnimatedVehicle> = {
      data: vehicle,
      sprites: [sprite, passengerIcon],
      texts: [passengerCountText],
      graphics: [graphics],
      container: vehicleContainer,
      backgroundContainer: backgroundContainer,
    };

    this.entitiesContainer.addChild(vehicleContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.vehicleEntities.push(entity);

    this.vehicleEntitiesByVehicleId[vehicle.id] = entity;
  }

  private addPassenger(passenger: AnimatedPassenger): void {
    const passengerContainer = new PIXI.Container();
    const backgroundContainer = new PIXI.Container();

    // Passenger Background shape
    const graphics = new PIXI.Graphics();
    backgroundContainer.addChild(graphics);

    const entity: Entity<AnimatedPassenger> = {
      data: passenger,
      sprites: [],
      texts: [],
      graphics: [graphics],
      container: passengerContainer,
      backgroundContainer: backgroundContainer,
    };

    this.entitiesContainer.addChild(passengerContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.passengersEntities.push(entity);

    this.passengerEntitiesByPassengerId[passenger.id] = entity;
  }

  private addPassengerStop(stop: AnimatedStop): void {
    const stopContainer = new PIXI.Container();
    const backgroundContainer = new PIXI.Container();

    // Background shape
    const graphics = new PIXI.Graphics();
    backgroundContainer.addChild(graphics);

    // Sprite
    const sprite = new PIXI.Sprite();
    sprite.anchor.set(0.5, 0.5);
    stopContainer.addChild(sprite);

    // Number of passengers
    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    stopContainer.addChild(passengerCountText);

    // Number of complete passengers
    const completePassengerCountText = new PIXI.BitmapText(
      '',
      this.BITMAP_TEXT_STYLE,
    );
    stopContainer.addChild(completePassengerCountText);

    // Passenger Icon
    const passengerIcon = new PIXI.Sprite();
    passengerIcon.anchor.set(0.5, 0.5);
    stopContainer.addChild(passengerIcon);

    const entity: Entity<AnimatedStop> = {
      data: stop,
      sprites: [sprite, passengerIcon],
      texts: [passengerCountText, completePassengerCountText],
      graphics: [graphics],
      container: stopContainer,
      backgroundContainer: backgroundContainer,
    };

    // Position
    const point = this.utils.latLngToLayerPoint([
      stop.position.latitude,
      stop.position.longitude,
    ]);
    stopContainer.x = point.x;
    stopContainer.y = point.y;

    this.entitiesContainer.addChild(stopContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.stopEntities.push(entity);

    this.stopEntitiesByPosition[stop.id] = entity;
  }

  clearAnimations() {
    this.entitiesContainer.removeChildren();
    this.backgroundContainer.removeChildren();
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
    this.hasCenteredInitially = false;
    this.vehicleEntities = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};
    this.unselectEntity();
    this.previousVehicleEntities = [];
    this.previousPassengerEntities = [];
    this.previousStopEntities = [];
  }

  setPause(pause: boolean) {
    this.pause = pause;
  }

  setFilters(filters: Set<string>) {
    this.filters = filters;
  }

  setFilterMode(filterMode: EntityFilterMode) {
    this.filterMode = filterMode;
  }

  setShouldShowComplete(shouldShowComplete: boolean) {
    this.shouldShowComplete = shouldShowComplete;
  }

  centerMap() {
    this._shouldFollowEntitySignal.set(false);

    const allVisibleVehicleEntities = this.previousVehicleEntities.filter(
      (vehicle) => vehicle.container.visible,
    );
    const allVehicleEntitiesY = allVisibleVehicleEntities.map(
      (vehicle) => vehicle.container.y,
    );
    const allVehicleEntitiesX = allVisibleVehicleEntities.map(
      (vehicle) => vehicle.container.x,
    );

    const allVisiblePassengerEntities = this.previousPassengerEntities.filter(
      (passenger) => passenger.container.visible,
    );
    const allPassengerEntitiesY = allVisiblePassengerEntities.map(
      (passenger) => passenger.container.y,
    );
    const allPassengerEntitiesX = allVisiblePassengerEntities.map(
      (passenger) => passenger.container.x,
    );

    const allVisibleStops = this.previousStopEntities.filter(
      (stop) => stop.container.visible,
    );
    const allStopEntitiesY = allVisibleStops.map((stop) => stop.container.y);
    const allStopEntitiesX = allVisibleStops.map((stop) => stop.container.x);

    const allEntitiesY = allVehicleEntitiesY.concat(
      allPassengerEntitiesY,
      allStopEntitiesY,
    );
    const allEntitiesX = allVehicleEntitiesX.concat(
      allPassengerEntitiesX,
      allStopEntitiesX,
    );

    if (allEntitiesY.length == 0 || allEntitiesX.length == 0) {
      console.warn('No entities to center map on');
      return;
    }

    const minimumLatitude = Math.min(...allEntitiesY);
    const maximumLatitude = Math.max(...allEntitiesY);

    const minimumLongitude = Math.min(...allEntitiesX);
    const maximumLongitude = Math.max(...allEntitiesX);

    // Add some padding (at least 10% of the horizontal/vertical space)
    const padding = 0.1;

    const horizontalDistance = maximumLongitude - minimumLongitude;
    const verticalDistance = maximumLatitude - minimumLatitude;

    const southWest = this.utils.layerPointToLatLng(
      new L.Point(
        minimumLongitude - padding * horizontalDistance,
        minimumLatitude - padding * verticalDistance,
      ),
    );

    const northEast = this.utils.layerPointToLatLng(
      new L.Point(
        maximumLongitude + padding * horizontalDistance,
        maximumLatitude + padding * verticalDistance,
      ),
    );

    this.utils.getMap().flyToBounds(new L.LatLngBounds(southWest, northEast));
  }

  private isPassengerFiltered(
    passenger: Entity<AnimatedPassenger>,
    showPassengers: boolean,
    showFavoritesOnly: boolean,
    shouldShowComplete: boolean,
  ) {
    return (
      showPassengers && // Are passengers not filtered
      passenger && // Is passenger in the environment
      (!showFavoritesOnly || // Is favorites filter on and is in favorites
        this.favoriteEntitiesService.isFavoriteEntity(passenger.data)) &&
      (shouldShowComplete || // Is complete filter on or is not complete
        passenger.data.status !== 'complete')
    );
  }

  private filterEntities() {
    const filters = this.filters;

    const shouldShowVehicles = !filters.has('vehicle');
    const shouldShowPassengers = !filters.has('passenger');
    const shouldShowStops = !filters.has('stops');
    const shouldShowFavoritesOnly = this.filterMode === 'favorites';
    const shouldShowComplete = this.shouldShowComplete;

    for (const vehicle of this.vehicleEntities) {
      vehicle.data.displayedPassengerIds =
        vehicle.data.animatedPassengerIds.filter((passengerId) => {
          const passenger = this.passengerEntitiesByPassengerId[passengerId];
          return passenger.container.visible;
        });

      vehicle.container.visible =
        vehicle.data.displayedPassengerIds.length > 0 || // Contains any passengers
        (vehicle.container.visible &&
          shouldShowVehicles && // Are vehicles not filtered
          !filters.has(vehicle.data.mode ?? 'unknown') && // Is mode not filtered
          (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
            this.favoriteEntitiesService.isFavoriteEntity(vehicle.data)) &&
          (shouldShowComplete || // Is complete filter on or is not complete
            vehicle.data.status !== 'complete'));
    }

    for (const passenger of this.passengersEntities) {
      passenger.container.visible =
        passenger.container.visible &&
        shouldShowPassengers && // Are passengers not filtered
        (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.isFavoriteEntity(passenger.data)) &&
        (shouldShowComplete || // Is complete filter on or is not complete
          passenger.data.status !== 'complete');
    }

    for (const stop of this.stopEntities) {
      stop.data.displayedPassengerIds = stop.data.animatedPassengerIds.filter(
        (passengerId) => {
          const passenger = this.passengerEntitiesByPassengerId[passengerId];
          return passenger.container.visible;
        },
      );

      stop.container.visible =
        stop.data.displayedPassengerIds.length > 0 || // Contains any passengers
        (stop.container.visible &&
          shouldShowStops && // Are stops not filtered
          (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
            this.favoriteEntitiesService.isFavoriteEntity(stop.data)));
    }

    const preselectedEntity = this.preselectedEntitySignal();

    // Always show preselected or selected vehicle
    const selectedVehicleId = preselectedEntity
      ? preselectedEntity?.entityType === 'vehicle'
        ? preselectedEntity.id
        : null
      : this.selectedVehicleIdSignal();

    if (selectedVehicleId) {
      const vehicle = this.vehicleEntitiesByVehicleId[selectedVehicleId];
      if (vehicle) vehicle.container.visible = true;
    }

    // Always show preselected or selected passenger
    const selectedPassengerId = preselectedEntity
      ? preselectedEntity?.entityType === 'passenger'
        ? preselectedEntity.id
        : null
      : this.selectedPassengerIdSignal();

    if (selectedPassengerId) {
      const passenger =
        this.passengerEntitiesByPassengerId[selectedPassengerId];
      if (passenger) passenger.container.visible = true;
    }

    // Always show preselected or selected stop
    const selectedStopId = preselectedEntity
      ? preselectedEntity?.entityType === 'stop'
        ? preselectedEntity.id
        : null
      : this.selectedStopIdSignal();
    if (selectedStopId) {
      const stop = this.stopEntitiesByPosition[selectedStopId];
      if (stop) {
        stop.container.visible = true;
      }
    }

    // Now that everything is filtered, we can turn visible the stops and vehicles
    // that have passengers.
    for (const vehicle of this.vehicleEntities) {
      vehicle.data.displayedPassengerIds =
        vehicle.data.animatedPassengerIds.filter((passengerId) => {
          const passenger = this.passengerEntitiesByPassengerId[passengerId];
          return passenger.container.visible;
        });

      vehicle.container.visible =
        vehicle.container.visible ||
        vehicle.data.displayedPassengerIds.length > 0; // Contains any passengers
    }
    for (const stop of this.stopEntities) {
      stop.data.displayedPassengerIds = stop.data.animatedPassengerIds.filter(
        (passengerId) => {
          const passenger = this.passengerEntitiesByPassengerId[passengerId];
          return passenger.container.visible;
        },
      );

      stop.container.visible =
        stop.container.visible || stop.data.displayedPassengerIds.length > 0; // Contains any passengers
    }
  }

  private setVehiclePositions() {
    // For loop with index are faster
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicleEntities.length; ++index) {
      const vehicleEntity = this.vehicleEntities[index];

      vehicleEntity.container.visible = false;

      vehicleEntity.data.animatedPassengerIds = [];

      if (!vehicleEntity.data.animationData) {
        continue;
      }

      const animationData = vehicleEntity.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Vehicle has no animation data
      // This can happen if the vehicle is not in the environment yet
      if (!animationData) {
        continue;
      }

      vehicleEntity.data.status = animationData.status;

      const polylineIndex: number =
        animationData.displayedPolylines.currentPolylineIndex;
      if (animationData.notDisplayedReason !== null) {
        // Vehicle has an error
      } else if (
        (animationData as StaticVehicleAnimationData).position !== undefined
      ) {
        vehicleEntity.container.visible = true;
        const staticVehicleAnimationData =
          animationData as StaticVehicleAnimationData;
        const point = this.utils.latLngToLayerPoint([
          staticVehicleAnimationData.position.latitude,
          staticVehicleAnimationData.position.longitude,
        ]);
        vehicleEntity.container.x = point.x;
        vehicleEntity.container.y = point.y;
        vehicleEntity.data.currentLineIndex =
          polylineIndex === -1
            ? 0
            : (animationData.displayedPolylines.polylines[polylineIndex]
                ?.polyline.length ?? 0) - 1;
      } else if (
        (animationData as DynamicVehicleAnimationData).polyline !== undefined
      ) {
        vehicleEntity.container.visible = true;
        const dynamicVehicleAnimationData =
          animationData as DynamicVehicleAnimationData;
        const [lineNo, lineProgress] = this.getLineNoAndProgress(
          dynamicVehicleAnimationData.displayedPolylines,
        );
        this.applyInterpolation(
          vehicleEntity,
          dynamicVehicleAnimationData.displayedPolylines.polylines[
            Math.min(
              polylineIndex,
              dynamicVehicleAnimationData.displayedPolylines.polylines.length -
                1,
            )
          ],
          lineNo,
          lineProgress,
        );
        vehicleEntity.data.currentLineIndex = lineNo;
      } else {
        // Vehicle has an unknown error
      }
    }
  }

  private setPassengerPositions() {
    // For loop with index are faster
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.passengersEntities.length; ++index) {
      const passengerEntity = this.passengersEntities[index];

      passengerEntity.container.visible = false;

      const animationData = passengerEntity.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Passenger has no animation data
      // This can happen if the passenger is not in the environment yet
      if (!animationData) {
        continue;
      }

      passengerEntity.data.status = animationData.status;

      if (animationData.notDisplayedReason !== null) {
        // Passenger has an error
      } else if (
        (animationData as StaticPassengerAnimationData).stopIndex !==
          undefined &&
        animationData.vehicleId !== null
      ) {
        passengerEntity.container.visible = true;
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        if (vehicleEntity !== undefined) {
          const allStops = getAllStops(vehicleEntity.data);
          const stop =
            allStops[(animationData as StaticPassengerAnimationData).stopIndex];
          if (stop !== undefined) {
            const point = this.utils.latLngToLayerPoint([
              stop.position.latitude,
              stop.position.longitude,
            ]);
            passengerEntity.container.x = point.x;
            passengerEntity.container.y = point.y;

            const animatedStop = this.stopEntitiesByPosition[stop.id];

            if (animatedStop) {
              animatedStop.data.animatedPassengerIds.push(
                passengerEntity.data.id,
              );
            }
          }
        } else {
          // Unknown bug
        }
      } else if (
        (animationData as DynamicPassengerAnimationData).isOnBoard === true &&
        animationData.vehicleId !== null
      ) {
        passengerEntity.container.visible = true;
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        if (vehicleEntity) {
          passengerEntity.container.x = vehicleEntity.container.x;
          passengerEntity.container.y = vehicleEntity.container.y;
          vehicleEntity.data.animatedPassengerIds.push(passengerEntity.data.id);
        }
      } else {
        // Passenger has an unknown error
      }
    }
  }

  private resetStopCounters() {
    for (const stopEntity of this.stopEntities) {
      stopEntity.container.visible = true;
      stopEntity.data.animatedPassengerIds = [];
      stopEntity.texts[0].text = '';
      stopEntity.texts[1].text = '';
      stopEntity.sprites[0].tint = this.WHITE;
      stopEntity.sprites[1].tint = this.WHITE;
    }
  }

  private updateStopCounters() {
    for (const stopEntity of this.stopEntities) {
      const allPassengers = stopEntity.data.animatedPassengerIds
        .map((passengerId) => this.passengerEntitiesByPassengerId[passengerId])
        .filter((passenger) => passenger !== undefined);

      const passengers = allPassengers.filter(
        (passenger) => passenger.data.status !== 'complete',
      );

      const numberOfPassengers = passengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      const completePassengers = allPassengers.filter(
        (passenger) => passenger.data.status === 'complete',
      );

      const numberOfCompletePassengers = completePassengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      const allDisplayedPassengers = stopEntity.data.displayedPassengerIds
        .map((passengerId) => this.passengerEntitiesByPassengerId[passengerId])
        .filter((passenger) => passenger !== undefined);

      const displayedPassengers = allDisplayedPassengers.filter(
        (passenger) => passenger.data.status !== 'complete',
      );

      const numberOfDisplayedPassengers = displayedPassengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      const displayedCompletePassengers = allDisplayedPassengers.filter(
        (passenger) => passenger.data.status === 'complete',
      );

      const numberOfDisplayedCompletePassengers =
        displayedCompletePassengers.reduce(
          (acc, passenger) => acc + passenger.data.numberOfPassengers,
          0,
        );

      if (
        numberOfDisplayedPassengers + numberOfDisplayedCompletePassengers ===
        0
      ) {
        continue;
      }

      if (numberOfDisplayedPassengers === 0) {
        stopEntity.texts[0].text = '';
      } else if (numberOfDisplayedPassengers === numberOfPassengers) {
        stopEntity.texts[0].text = numberOfPassengers.toString();
      } else {
        stopEntity.texts[0].text = `${numberOfPassengers} (${numberOfDisplayedPassengers})`;
      }

      if (numberOfDisplayedCompletePassengers === 0) {
        stopEntity.texts[1].text = '';
      } else if (
        numberOfDisplayedCompletePassengers === numberOfCompletePassengers
      ) {
        stopEntity.texts[1].text = numberOfCompletePassengers.toString();
      } else {
        stopEntity.texts[1].text = `${numberOfCompletePassengers} (${numberOfDisplayedCompletePassengers})`;
      }

      if (
        numberOfDisplayedPassengers === 0 &&
        numberOfDisplayedCompletePassengers === 0
      ) {
        stopEntity.texts[0].tint = 0xffffff;
        stopEntity.texts[1].tint = 0xffffff;
        stopEntity.sprites[0].tint = 0xffffff;
        stopEntity.sprites[1].tint = 0xffffff;
        return;
      }

      const interpolate = d3InterpolateRgb(
        this.spritesService.currentColorPreset,
      );

      // Only count not complete passengers for the tint
      const t = Math.min(1, numberOfPassengers / stopEntity.data.capacity);

      const color = d3Color(interpolate(t))?.rgb();

      if (color) {
        const tint = 256 * (color.r * 256 + color.g) + color.b;
        stopEntity.texts[0].tint = tint;
        stopEntity.texts[1].tint = tint;
        stopEntity.sprites[0].tint = tint;
        stopEntity.sprites[1].tint = tint;
      } else {
        console.warn('Color interpolation failed');
      }
    }
  }

  private updateVehiclePassengerCounters() {
    const interpolate = d3InterpolateRgb(
      this.spritesService.currentColorPreset,
    );

    // For loop with index are faster
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicleEntities.length; ++index) {
      const vehicleEntity = this.vehicleEntities[index];

      const passengers = vehicleEntity.data.animatedPassengerIds.map(
        (passengerId) => this.passengerEntitiesByPassengerId[passengerId],
      );
      const numberOfPassengers = passengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      const displayedPassengers = vehicleEntity.data.displayedPassengerIds.map(
        (passengerId) => this.passengerEntitiesByPassengerId[passengerId],
      );

      const numberOfDisplayedPassengers = displayedPassengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      if (numberOfDisplayedPassengers === 0) {
        vehicleEntity.texts[0].text = '';
        vehicleEntity.texts[0].tint = 0xffffff;
        vehicleEntity.sprites[0].tint = 0xffffff;
        vehicleEntity.sprites[1].tint = 0xffffff;
        continue;
      } else if (numberOfDisplayedPassengers === numberOfPassengers) {
        vehicleEntity.texts[0].text = numberOfPassengers.toString();
      } else {
        vehicleEntity.texts[0].text = `${numberOfPassengers} (${numberOfDisplayedPassengers})`;
      }

      const t = Math.min(1, numberOfPassengers / vehicleEntity.data.capacity);
      const color = d3Color(interpolate(t))?.rgb();
      if (!color) continue;

      const tint = 256 * (color.r * 256 + color.g) + color.b;
      vehicleEntity.texts[0].tint = tint;
      vehicleEntity.sprites[0].tint = tint;
      vehicleEntity.sprites[1].tint = tint;
    }
  }

  private getLineNoAndProgress(displayedPolylines: DisplayedPolylines) {
    if (
      displayedPolylines.currentPolylineEndTime === null ||
      displayedPolylines.currentPolylineStartTime === null
    ) {
      return [0, 0];
    }

    if (displayedPolylines.currentPolylineIndex === -1) {
      return [0, 0];
    }

    if (
      displayedPolylines.currentPolylineIndex >=
      displayedPolylines.polylines.length
    ) {
      return [0, 0];
    }

    const polylineProgress =
      (this.animationVisualizationTime -
        displayedPolylines.currentPolylineStartTime) /
      (displayedPolylines.currentPolylineEndTime -
        displayedPolylines.currentPolylineStartTime);

    const polyline =
      displayedPolylines.polylines[displayedPolylines.currentPolylineIndex];

    const coefficients = polyline.coefficients;
    let lineProgress = 0;
    let cumulativeProgress = 0;
    let lineNo = 0;
    for (; lineNo < coefficients.length; ++lineNo) {
      const nextCumulativeProgress = cumulativeProgress + coefficients[lineNo];
      if (polylineProgress < nextCumulativeProgress) {
        lineProgress =
          (polylineProgress - cumulativeProgress) /
          (nextCumulativeProgress - cumulativeProgress);
        break;
      }
      cumulativeProgress = nextCumulativeProgress;
    }

    return [lineNo, lineProgress];
  }

  private applyInterpolation(
    vehicleEntity: Entity<Vehicle>,
    polyline: Polyline,
    lineNo: number,
    lineProgress: number,
  ) {
    let geoPosA = polyline.polyline[lineNo];
    let geoPosB = polyline.polyline[lineNo + 1];

    // If no next point, take previous point instead
    if (!geoPosB) {
      if (!geoPosA) return new L.Point(0, 0);
      geoPosB = geoPosA;
      geoPosA = polyline.polyline[lineNo - 1];

      // If no previous point, share same point
      if (!geoPosA) geoPosA = geoPosB;
      lineProgress = 1;
    }

    const pointA = this.utils.latLngToLayerPoint([
      geoPosA.latitude,
      geoPosA.longitude,
    ]);
    const pointB = this.utils.latLngToLayerPoint([
      geoPosB.latitude,
      geoPosB.longitude,
    ]);

    const interpolatedPosition = pointB
      .multiplyBy(lineProgress)
      .add(pointA.multiplyBy(1 - lineProgress));

    vehicleEntity.container.x = interpolatedPosition.x;
    vehicleEntity.container.y = interpolatedPosition.y;

    // Set orientation
    const direction = pointB.subtract(pointA);
    const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
    vehicleEntity.sprites[0].rotation = angle;

    return interpolatedPosition;
  }

  private findVisuallyNearEntities(event: L.LeafletMouseEvent) {
    // 20 comes from half the size of the images in pixels
    const minVisualDistance = 20 / this.utils.getScale();
    const point = this.utils.latLngToLayerPoint(event.latlng);

    const nearVehicles: EntityMetadata[] = [];
    const nearPassengers: EntityMetadata[] = [];
    const nearStops: EntityMetadata[] = [];

    // Distances for all vehicles
    for (const vehicle of this.vehicleEntities) {
      if (!vehicle.container.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        vehicle.container.position,
      );
      if (distance <= minVisualDistance)
        nearVehicles.push({
          id: vehicle.data.id,
          name: vehicle.data.name,
          entityType: 'vehicle',
          tags: vehicle.data.tags,
        });
    }

    // Distances for all passengers
    // for (const passenger of this.passengersEntities) {
    //   if (!passenger.container.visible) continue;
    //   const distance = this.distanceBetweenPoints(
    //     point,
    //     passenger.container.position,
    //   );
    //   if (distance <= minVisualDistance)
    //     nearPassengers.push({
    //       id: passenger.data.id,
    //       name: passenger.data.name,
    //       entityType: 'passenger',
    //       tags: passenger.data.tags,
    //     });
    // }

    // Distances for all stops
    for (const stop of this.stopEntities) {
      if (!stop.container.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        stop.container.position,
      );
      if (distance <= minVisualDistance) {
        nearStops.push({
          id: stop.data.id,
          name: stop.data.label,
          entityType: 'stop',
          tags: stop.data.tags,
        });
      }
    }

    const allNearEntities = [...nearVehicles, ...nearPassengers, ...nearStops];

    // No entities
    if (allNearEntities.length === 0) {
      this.unselectEntity();
    }
    // One vehicle
    else if (allNearEntities.length === 1 && nearVehicles.length === 1) {
      this.selectVehicle(nearVehicles[0].id);
    }
    // One passenger
    else if (allNearEntities.length === 1 && nearPassengers.length === 1) {
      this.selectPassenger(nearPassengers[0].id);
    }
    // One stop
    else if (allNearEntities.length === 1 && nearStops.length === 1) {
      this.selectStop(nearStops[0].id);
    }
    // More than one
    else {
      this.unselectEntity();
      this._clickPositionSignal.set(
        new PIXI.Point(event.containerPoint.x, event.containerPoint.y),
      );
      this._nearVehiclesSignal.set(nearVehicles);
      this._nearPassengersSignal.set(nearPassengers);
      this._nearStopsSignal.set(nearStops);
    }
  }

  private distanceBetweenPoints(
    pointA: { x: number; y: number },
    pointB: { x: number; y: number },
  ) {
    const dx = pointA.x - pointB.x;
    const dy = pointA.y - pointB.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  private drawPolylines() {
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());

    const preselectedEntity = this.preselectedEntitySignal();

    if (preselectedEntity !== null) {
      if (preselectedEntity.entityType === 'vehicle') {
        const vehicle = this.vehicleEntitiesByVehicleId[preselectedEntity.id];
        if (vehicle && vehicle.container.visible) {
          this.drawVehiclePolylines(vehicle);
        }
      } else if (preselectedEntity.entityType === 'passenger') {
        const passenger =
          this.passengerEntitiesByPassengerId[preselectedEntity.id];
        if (passenger && passenger.container.visible) {
          this.drawPassengerPolylines(passenger);
        }
      }
      return;
    }

    const selectedVehicleId = this.selectedVehicleIdSignal();
    if (selectedVehicleId) {
      const vehicle = this.vehicleEntitiesByVehicleId[selectedVehicleId];
      if (vehicle && vehicle.container.visible) {
        this.drawVehiclePolylines(vehicle);
      }
      return;
    }

    const selectedPassengerId = this.selectedPassengerIdSignal();
    if (selectedPassengerId) {
      const passenger =
        this.passengerEntitiesByPassengerId[selectedPassengerId];
      if (passenger && passenger.container.visible) {
        this.drawPassengerPolylines(passenger);
      }
      return;
    }
  }

  private drawVehiclePolylines(vehicleEntity: Entity<AnimatedVehicle>) {
    if (vehicleEntity.data.currentLineIndex === null) {
      return;
    }

    const interpolatedPoint = new L.Point(
      vehicleEntity.container.x,
      vehicleEntity.container.y,
    );

    const animationData = vehicleEntity.data.animationData.find(
      (data) =>
        data.startTimestamp <= this.animationVisualizationTime &&
        data.endTimestamp! >= this.animationVisualizationTime,
    );

    if (!animationData) {
      return;
    }

    if (this.selectedEntityPolylines.length === 0) {
      this.addPolylineGraphics();
    }

    this.redrawPolyline(
      animationData.displayedPolylines.currentPolylineIndex,
      vehicleEntity.data.currentLineIndex,
      interpolatedPoint,
      animationData.displayedPolylines.polylines,
      this.selectedEntityPolylines[0],
    );
  }

  private drawPassengerPolylines(passengerEntity: Entity<AnimatedPassenger>) {
    const passengerAnimationData = passengerEntity.data.animationData.find(
      (data) =>
        data.startTimestamp <= this.animationVisualizationTime &&
        data.endTimestamp! >= this.animationVisualizationTime,
    );

    const legs = passengerEntity.data.currentLeg
      ? [
          ...passengerEntity.data.previousLegs,
          passengerEntity.data.currentLeg,
          ...passengerEntity.data.nextLegs,
        ]
      : [
          ...passengerEntity.data.previousLegs,
          ...passengerEntity.data.nextLegs,
        ];

    // If we have less entity polylines than legs, add the additional missing polylines
    while (this.selectedEntityPolylines.length < legs.length) {
      this.addPolylineGraphics();
    }

    // Collect all polylines
    for (let i = 0; i < legs.length; ++i) {
      const leg = legs[i];

      if (
        leg.assignedVehicleId === null ||
        leg.boardingStopIndex === null ||
        leg.alightingStopIndex === null
      )
        continue;

      const vehicle = this.vehicleEntitiesByVehicleId[leg.assignedVehicleId];
      if (!vehicle) continue;

      const vehicleAnimationData = vehicle.data.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );
      if (vehicleAnimationData === undefined) continue;

      // Get polylines that passenger will be inside vehicle
      const passengerPath =
        vehicleAnimationData.displayedPolylines.polylines.slice(
          leg.boardingStopIndex,
          leg.alightingStopIndex,
        );

      const graphics = this.selectedEntityPolylines[i];

      if (graphics == null) return; // Safe check return when unknown bug

      const shouldHighlightLeg = i === this.highlightedLegIndex;
      if (shouldHighlightLeg) {
        graphics.filters = [
          new OutlineFilter(1, 0xffffff),
          new OutlineFilter(2, 0xffff00),
        ];
      } else {
        graphics.filters = [];
      }

      let calculatedPolylineNo = passengerPath.length;
      let lineNo = 0;

      // If the passenger in the vehicle or waiting for it
      if (vehicle.data.id === passengerAnimationData?.vehicleId) {
        const relativePolylineIndex =
          vehicleAnimationData.displayedPolylines.currentPolylineIndex -
          leg.boardingStopIndex;

        if (relativePolylineIndex >= 0) {
          calculatedPolylineNo = relativePolylineIndex;
          lineNo = vehicle.data.currentLineIndex ?? 0;
        } else {
          calculatedPolylineNo = 0;
        }
      }

      this.redrawPolyline(
        calculatedPolylineNo,
        lineNo,
        new L.Point(passengerEntity.container.x, passengerEntity.container.y),
        passengerPath,
        graphics,
      );
    }
  }

  private redrawPolyline(
    polylineNo: number,
    lineNo: number,
    interpolatedPoint: L.Point,
    polylines: Polyline[],
    graphics: PIXI.Graphics,
  ) {
    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;
    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);
    graphics.clear();
    graphics.lineStyle(width, this.LIGHT_GRAY, ALPHA);

    // Draw all polylines before the polylineNo
    for (let i = 0; i < polylineNo; ++i) {
      if (i >= polylines.length) break;
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;
      const firstPoint = polyline.polyline[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);

      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    // Draw all the lines of polylineNo but before lineNo
    const currentPolyline = polylines[polylineNo];
    if (currentPolyline !== undefined) {
      const polylinePoints = currentPolyline.polyline;
      if (polylinePoints.length === 0) return;
      const firstPoint = polylinePoints[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);

      for (let j = 1; j <= Math.min(lineNo, polylinePoints.length - 1); ++j) {
        const geoPos = currentPolyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }

      // Draw line until interpolated point
      graphics.lineTo(interpolatedPoint.x, interpolatedPoint.y);

      // Change color
      graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

      // Draw rest of lines of polylineNo
      for (let j = lineNo + 1; j < currentPolyline.polyline.length; ++j) {
        const geoPos = currentPolyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    // Draw rest of polylines
    for (let i = polylineNo + 1; i < polylines.length; ++i) {
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;
      const firstPoint = polyline.polyline[0];
      const firstLayerPoint = this.utils.latLngToLayerPoint([
        firstPoint.latitude,
        firstPoint.longitude,
      ]);
      graphics.moveTo(firstLayerPoint.x, firstLayerPoint.y);
      for (let j = 1; j < polyline.polyline.length; ++j) {
        const geoPos = polyline.polyline[j];
        const point = this.utils.latLngToLayerPoint([
          geoPos.latitude,
          geoPos.longitude,
        ]);
        graphics.lineTo(point.x, point.y);
      }
    }

    graphics.lineStyle(width, this.LIGHT_GRAY, ALPHA);

    let firstStopHasBeenDrawn = false;

    // Draw stops that are completed
    for (let i = 0; i <= polylineNo; ++i) {
      if (i >= polylines.length) break;
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;

      if (!firstStopHasBeenDrawn) {
        const firstPoint = polyline.polyline[0];
        const firstLayerPoint = this.utils.latLngToLayerPoint([
          firstPoint.latitude,
          firstPoint.longitude,
        ]);
        graphics.beginFill(this.WHITE, 1);
        graphics.drawCircle(firstLayerPoint.x, firstLayerPoint.y, width * 1.2);
        graphics.endFill();
        firstStopHasBeenDrawn = true;
      }

      const geoPos = polyline.polyline[polyline.polyline.length - 1];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(point.x, point.y, width * 1.2);
      graphics.endFill();
    }

    // Draw stops that are not completed
    graphics.lineStyle(width, this.KELLY_GREEN, ALPHA);

    for (let i = Math.max(polylineNo, 0); i < polylines.length; ++i) {
      const polyline = polylines[i];
      if (polyline.polyline.length === 0) continue;

      if (!firstStopHasBeenDrawn) {
        const firstPoint = polyline.polyline[0];
        const firstLayerPoint = this.utils.latLngToLayerPoint([
          firstPoint.latitude,
          firstPoint.longitude,
        ]);
        graphics.beginFill(this.WHITE, 1);
        graphics.drawCircle(firstLayerPoint.x, firstLayerPoint.y, width * 1.2);
        graphics.endFill();
        firstStopHasBeenDrawn = true;
      }

      const geoPos = polyline.polyline[polyline.polyline.length - 1];
      const point = this.utils.latLngToLayerPoint([
        geoPos.latitude,
        geoPos.longitude,
      ]);
      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(point.x, point.y, width * 1.2);
      graphics.endFill();
    }
  }

  private updateAnimationTime() {
    const deltaSec = PIXI.Ticker.shared.deltaMS / 1000;
    if (!this.pause) {
      this.animationVisualizationTime += deltaSec * this.speed;
      this.lastVisualisationTime += deltaSec * this.speed;
    }

    const desyncDiff =
      this.lastVisualisationTime - this.animationVisualizationTime;
    if (Math.abs(desyncDiff) > this.MIN_LERPABLE_DESYNC_DIFF * this.speed) {
      this.animationVisualizationTime +=
        desyncDiff * (1 - Math.exp(-5 * Math.abs(deltaSec)));
    }
  }

  // Called once when Pixi layer is added.
  private onAdd(utils: L.PixiOverlayUtils) {
    this.lastScale = utils.getScale();
    this.spritesService.calculateSpriteScales(utils);
  }

  private onMoveEnd(event: L.LeafletEvent) {
    const scale = this.utils.getScale();
    if (scale != this.lastScale) this.onZoomEnd(event);
    this.lastScale = scale;
  }

  private onZoomEnd(event: L.LeafletEvent) {
    this.spritesService.calculateSpriteScales(this.utils);
  }

  private onRedraw(event?: L.LeafletEvent) {
    if (this.startTimestamp == null || this.endTimestamp == null) return;

    if (this.pause) {
      this.animationVisualizationTime = this.lastVisualisationTime;
    } else {
      this.updateAnimationTime();
    }

    if (this.animationVisualizationTime < this.startTimestamp) {
      this.animationVisualizationTime = this.startTimestamp;
    }

    if (this.animationVisualizationTime > this.endTimestamp) {
      this.animationVisualizationTime = this.endTimestamp;
    }

    this.resetStopCounters();
    this.setVehiclePositions();
    this.setPassengerPositions();
    this.filterEntities();
    this.drawPolylines();
    this.highlightEntities();
    this.updateVehiclePassengerCounters();
    this.updateStopCounters();
    this.updateTextures();
    this.setSelectedEntityPosition();
    this.centerMapToFirstVisibleEntity();
  }

  private highlightEntities() {
    for (const vehicle of this.vehicleEntities) {
      vehicle.container.filters = [];
    }

    for (const passenger of this.passengersEntities) {
      passenger.container.filters = [];
    }

    for (const stop of this.stopEntities) {
      stop.container.filters = [];
      stop.container.filters = [];
    }

    const preselectedEntity = this.preselectedEntitySignal();

    if (preselectedEntity !== null) {
      this.highlightEntityId(
        preselectedEntity.id,
        preselectedEntity.entityType,
      );
      return;
    }

    const selectedVehicleId = this._selectedVehicleIdSignal();
    if (selectedVehicleId !== null) {
      this.highlightEntityId(selectedVehicleId, 'vehicle');
      return;
    }

    const selectedPassengerId = this._selectedPassengerIdSignal();
    if (selectedPassengerId !== null) {
      this.highlightEntityId(selectedPassengerId, 'passenger');
      return;
    }

    const selectedStopId = this._selectedStopIdSignal();
    if (selectedStopId !== null) {
      this.highlightEntityId(selectedStopId, 'stop');
      return;
    }
  }

  private setSelectedEntityPosition() {
    let entityToFollow: { id: string; entityType: EntityType } | null = null;

    const preselectedEntity = this.preselectedEntitySignal();

    const selectedVehicleId = this.selectedVehicleIdSignal();
    const selectedPassengerId = this.selectedPassengerIdSignal();
    const selectedStopId = this.selectedStopIdSignal();

    if (preselectedEntity !== null) {
      entityToFollow = {
        id: preselectedEntity.id,
        entityType: preselectedEntity.entityType,
      };
    } else if (selectedVehicleId !== null) {
      entityToFollow = {
        id: selectedVehicleId,
        entityType: 'vehicle',
      };
    } else if (selectedPassengerId !== null) {
      entityToFollow = {
        id: selectedPassengerId,
        entityType: 'passenger',
      };
    } else if (selectedStopId !== null) {
      entityToFollow = {
        id: selectedStopId,
        entityType: 'stop',
      };
    }

    switch (entityToFollow?.entityType) {
      case 'vehicle':
        {
          const vehicle = this.vehicleEntitiesByVehicleId[entityToFollow.id];
          const x = vehicle.container.x;
          const y = vehicle.container.y;
          if (x === 0 && y === 0) break;
          this.frame_pointToFollow = this.utils.layerPointToLatLng(
            new L.Point(x, y),
          );
        }
        break;
      case 'passenger':
        {
          const passenger =
            this.passengerEntitiesByPassengerId[entityToFollow.id];
          const x = passenger.container.x;
          const y = passenger.container.y;
          if (x === 0 && y === 0) break;
          this.frame_pointToFollow = this.utils.layerPointToLatLng(
            new L.Point(x, y),
          );
        }
        break;

      case 'stop':
        {
          const stop = this.stopEntitiesByPosition[entityToFollow.id];
          const x = stop.container.x;
          const y = stop.container.y;
          if (x === 0 && y === 0) break;
          this.frame_pointToFollow = this.utils.layerPointToLatLng(
            new L.Point(x, y),
          );
        }
        break;
    }
  }

  private centerMapToFirstVisibleEntity() {
    if (this.hasCenteredInitially || !this.utils) {
      return;
    }

    const points: {
      x: number;
      y: number;
    }[] = [];

    let minimumX: number | null = null;
    let maximumX: number | null = null;
    let minimumY: number | null = null;
    let maximumY: number | null = null;

    const updateBounds = (x: number, y: number) => {
      if (minimumX === null || x < minimumX) minimumX = x;
      if (maximumX === null || x > maximumX) maximumX = x;
      if (minimumY === null || y < minimumY) minimumY = y;
      if (maximumY === null || y > maximumY) maximumY = y;
    };

    // Get all visible vehicles coordinates
    this.vehicleEntities.forEach((vehicle) => {
      if (
        vehicle.container.visible &&
        vehicle.container.x !== 0 &&
        vehicle.container.y !== 0
      ) {
        const x = vehicle.container.x;
        const y = vehicle.container.y;
        updateBounds(x, y);
        points.push({
          x,
          y,
        });
      }
    });

    // Get all visible passengers coordinates
    this.passengersEntities.forEach((passenger) => {
      if (passenger.container.visible) {
        const x = passenger.container.x;
        const y = passenger.container.y;
        updateBounds(x, y);
        points.push({
          x,
          y,
        });
      }
    });

    // Get all visible stops coordinates
    this.stopEntities.forEach((stop) => {
      if (stop.container.visible) {
        const x = stop.container.x;
        const y = stop.container.y;
        updateBounds(x, y);
        points.push({
          x,
          y,
        });
      }
    });

    // Compute bounds and get center
    if (
      minimumX === null ||
      maximumX === null ||
      minimumY === null ||
      maximumY === null ||
      points.length === 0
    ) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    const centerX = (minimumX + maximumX) / 2;
    // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
    const centerY = (minimumY + maximumY) / 2;

    const centerPoint = {
      x: centerX,
      y: centerY,
    };

    const closestPoint = points.reduce((prev, curr) => {
      const prevDistance = this.distanceBetweenPoints(centerPoint, prev);
      const currDistance = this.distanceBetweenPoints(centerPoint, curr);
      return prevDistance < currDistance ? prev : curr;
    });

    this.utils
      .getMap()
      .setView(
        this.utils.layerPointToLatLng(
          new L.Point(closestPoint.x, closestPoint.y),
        ),
      );
    this.hasCenteredInitially = true;
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    this.findVisuallyNearEntities(event);
  }

  private selectVehicle(vehicleId: string) {
    this.unselectEntity();
    this._selectedVehicleIdSignal.set(vehicleId);
  }

  private selectPassenger(passengerId: string) {
    this.unselectEntity();
    this._selectedPassengerIdSignal.set(passengerId);
  }

  private selectStop(stopId: string) {
    this.unselectEntity();
    this._selectedStopIdSignal.set(stopId);
  }

  private unselectVehicle() {
    this._selectedVehicleIdSignal.set(null);
  }

  private unselectPassenger() {
    this._selectedPassengerIdSignal.set(null);
    this.highlightedLegIndex = null;
  }

  private unselectStop() {
    this._selectedStopIdSignal.set(null);
  }

  private highlightEntityId(entityId: string, type: EntityType) {
    let entity;
    switch (type) {
      case 'vehicle':
        entity = this.vehicleEntitiesByVehicleId[entityId];
        break;
      case 'passenger':
        entity = this.passengerEntitiesByPassengerId[entityId];
        break;
      case 'stop':
        entity = this.stopEntitiesByPosition[entityId];
        break;
    }

    if (entity) {
      entity.container.filters = [
        new OutlineFilter(1, 0xffffff),
        new OutlineFilter(2, 0xffff00),
      ];
    }
  }

  unpreselectEntity() {
    this._preselectedEntityIdSignal.set(null);
  }

  preselectEntity(
    entityMetadata: EntityMetadata,
    shouldShowSelectedEntityTab: boolean,
  ) {
    this._preselectedEntityIdSignal.set({
      ...entityMetadata,
      shouldShowSelectedEntityTab,
    });
  }

  selectEntity(entityId: string, type: EntityType) {
    this._preselectedEntityIdSignal.set(null);
    this.unselectEntity();

    switch (type) {
      case 'vehicle':
        this.selectVehicle(entityId);
        break;
      case 'passenger':
        this.selectPassenger(entityId);
        break;
      case 'stop':
        this.selectStop(entityId);
        break;
    }
  }

  unselectEntity() {
    this._preselectedEntityIdSignal.set(null);
    this.unselectVehicle();
    this.unselectPassenger();
    this.unselectStop();
  }

  highlightLeg(legIndex: number) {
    this.highlightedLegIndex = legIndex;
  }

  unhighlightLeg() {
    this.highlightedLegIndex = null;
  }

  addPixiOverlay(map: L.Map) {
    map.on('click', (event) => {
      this.onClick(event);
    });
    const pixiLayer = (() => {
      return pixiOverlay(
        (utils, event) => {
          this.utils = utils;
          if (event.type === 'add') this.onAdd(utils);
          if (event.type === 'moveend') this.onMoveEnd(event);
          if (event.type === 'redraw') this.onRedraw(event);
          this.utils.getRenderer().render(this.mainContainer);
        },
        this.mainContainer,
        {
          doubleBuffering: true,
        },
      );
    })();

    pixiLayer.addTo(map);

    PIXI.Ticker.shared.add((delta) => {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as L.LeafletEvent);

      if (this.frame_pointToFollow && this._shouldFollowEntitySignal())
        this.utils.getMap().setView(this.frame_pointToFollow);
      this.frame_pointToFollow = null;
    });
    PIXI.Ticker.shared.start();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  toggleShouldFollowEntity() {
    this._shouldFollowEntitySignal.update(
      (shouldFollowEntity) => !shouldFollowEntity,
    );
  }

  findPassengerName(id: string) {
    if (!this.passengerEntitiesByPassengerId[id]) {
      return;
    }
    return this.passengerEntitiesByPassengerId[id].data.name;
  }

  private updateTextures() {
    const showText = !this.spritesService.useZoomedOutSprites;

    this.vehicleEntities.forEach((entity) => {
      // Configure containers
      entity.container.scale.set(this.spritesService.vehicleSpriteScale);
      this.synchronizeBackgroundWithEntity(entity);

      // Top right corner
      entity.texts[0].visible = showText;
      entity.texts[0].x = entity.sprites[0].width / 2;
      entity.texts[0].y = -entity.sprites[0].height / 2;

      this.spritesService.drawVehicleBackgroundShape(
        entity.graphics[0],
        entity.data.mode,
        entity.data.tags,
      );

      entity.sprites[0].texture = this.spritesService.getVehicleTexture(
        entity.data.mode,
        entity.data.tags,
      );

      // Passenger Icon
      entity.sprites[1].texture = this.spritesService.getPassengerTexture(
        entity.data.displayedPassengerIds
          .map(
            (passengerId) =>
              this.passengerEntitiesByPassengerId[passengerId].data.tags,
          )
          .flat(),
      );
      entity.sprites[1].visible = entity.data.displayedPassengerIds.length > 0;
      entity.sprites[1].scale.set(
        this.spritesService.passengerSpriteScale /
          this.spritesService.vehicleSpriteScale,
      );
    });

    this.passengersEntities.forEach((entity) => {
      // Configure container
      entity.container.scale.set(this.spritesService.passengerSpriteScale);
      this.synchronizeBackgroundWithEntity(entity);

      this.spritesService.drawPassengerBackgroundShape(
        entity.graphics[0],
        entity.data.tags,
      );
    });

    this.stopEntities.forEach((entity) => {
      // Configure container
      entity.container.scale.set(this.spritesService.passengerSpriteScale);
      this.synchronizeBackgroundWithEntity(entity);

      entity.sprites[0].texture = this.spritesService.getStopTexture(
        entity.data.tags,
      );
      entity.sprites[0].scale.set(
        this.spritesService.stopSpriteScale /
          this.spritesService.passengerSpriteScale,
      );

      this.spritesService.drawStopBackgroundShape(
        entity.graphics[0],
        entity.data.tags,
      );

      // Passenger Icon
      entity.sprites[1].texture = this.spritesService.getPassengerTexture(
        entity.data.displayedPassengerIds
          .map(
            (passengerId) =>
              this.passengerEntitiesByPassengerId[passengerId].data.tags,
          )
          .flat(),
      );
      entity.sprites[1].visible = entity.data.displayedPassengerIds.length > 0;

      // Top right corner
      entity.texts[0].visible = showText;
      entity.texts[0].x = entity.sprites[1].width / 2;
      entity.texts[0].y = -entity.sprites[1].height / 2;

      // Bottom right corner
      entity.texts[1].visible = showText;
      entity.texts[1].x = entity.sprites[1].width / 2;
      entity.texts[1].y = entity.sprites[1].height / 2;
    });
  }

  private addPolylineGraphics() {
    const newPolylineGraphics = new PIXI.Graphics();
    this.selectedEntityPolylines.push(newPolylineGraphics);
    this.polylinesContainer.addChild(newPolylineGraphics);
  }

  private synchronizeBackgroundWithEntity(
    entity: Entity<AnimatedVehicle | AnimatedPassenger | AnimatedStop>,
  ) {
    entity.backgroundContainer.visible = entity.container.visible;
    entity.backgroundContainer.x = entity.container.x;
    entity.backgroundContainer.y = entity.container.y;
    entity.backgroundContainer.scale.x = entity.container.scale.x;
    entity.backgroundContainer.scale.y = entity.container.scale.y;
  }
}
