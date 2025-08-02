import 'leaflet-pixi-overlay';

import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { color as d3Color } from 'd3-color';
import { interpolateRgbBasis as d3InterpolateRgb } from 'd3-interpolate';
import {
  LatLngBounds,
  LeafletEvent,
  LeafletMouseEvent,
  Point as LeafletPoint,
  Map,
  pixiOverlay,
  PixiOverlayUtils,
} from 'leaflet';
import { OutlineFilter } from 'pixi-filters';
import {
  Assets,
  BitmapText,
  Container,
  Graphics,
  IBitmapTextStyle,
  Sprite,
  Ticker,
} from 'pixi.js';
import {
  AnimatedEntity,
  AnimatedPassenger,
  AnimatedStop,
  AnimatedVehicle,
  isAnimatedPassenger,
  isAnimatedVehicle,
} from '../interfaces/animation.model';
import {
  ContinuousEnvironment,
  EnvironmentSlice,
  findClosestContinuousEnvironment,
  isIntervalCovered,
  sliceEnvironment,
} from '../interfaces/continuous.model';
import { EntityFilterMode, EntityMetadata } from '../interfaces/entity.model';
import { getAllLegs, Passenger } from '../interfaces/passenger.model';
import { AllPolylines, Polyline } from '../interfaces/polylines.model';
import { Stop } from '../interfaces/stop.model';
import { getAllStops, Vehicle } from '../interfaces/vehicle.model';
import { FavoriteEntitiesService } from './favorite-entities.service';
import { SpritesService } from './sprites.service';
import { TaskService } from './task.service';

@Injectable({
  providedIn: 'root',
})
export class AnimationService {
  // MARK: Constants
  private readonly MAXIMUM_ALLOWED_DESYNCHRONIZATION_DIFFERENCE = 1.5;

  private readonly WHITE = 0xffffff;

  private readonly BITMAP_TEXT_URL = 'bitmap-fonts/custom-sans-serif.xml';
  private readonly BITMAP_TEXT_STYLE: Partial<IBitmapTextStyle> = {
    fontName: 'custom-sans-serif',
    fontSize: 18,
  };

  private readonly POLYLINE_WIDTH = 4;
  private readonly POLYLINE_MIN_WIDTH = 0.04;
  private readonly POLYLINE_ALPHA = 0.9;
  private readonly POLYLINE_COMPLETE_COLOR = 0x666666;
  private readonly POLYLINE_REMAINING_COLOR = 0x028a0f;

  private readonly SAFETY_RATIO = 0.95; // Safety ratio to ensure we don't exceed the frame time
  private readonly MIN_FRAME_RATE = 60; // This can be increased at the cost of a longer load time.
  private readonly MIN_TIME_PER_FRAME =
    (1000 / this.MIN_FRAME_RATE) * this.SAFETY_RATIO;

  // MARK: Properties

  // Use two variables to avoid changing the ones used for the animation during the animation
  private nextContinuousEnvironments: ContinuousEnvironment[] = [];
  private nextWantedVisualizationTime: number | null = null;
  private nextPolylines: AllPolylines | null = null;
  private nextIsPaused = false;
  private nextSpeed = 1;
  private nextFilters: Set<string> = new Set<string>();
  private nextFilterMode: EntityFilterMode = 'all';
  private nextShouldShowComplete = false;
  private nextShouldCenterMap = false;
  private nextShouldFollowEntity = false;
  private nextClickEvent: LeafletMouseEvent | null = null;
  private nextHighlightedLegIndex: number | null = null;
  private nextShouldFindCloseEntities = false;

  private continuousEnvironments: ContinuousEnvironment[] = [];

  private wantedVisualizationTime: number | null = null;
  private animationVisualizationTime = 0;

  private polylines: AllPolylines | null = null;

  private hasCenteredInitially = false;

  private isPaused = false;
  private speed = 1;

  private vehicleEntities: AnimatedVehicle[] = [];
  private vehicleEntitiesByVehicleId: Record<string, AnimatedVehicle> = {};

  private passengersEntities: AnimatedPassenger[] = [];
  private passengerEntitiesByPassengerId: Record<string, AnimatedPassenger> =
    {};

  private stopEntities: AnimatedStop[] = [];
  private stopEntitiesByPosition: Record<string, AnimatedStop> = {};

  private presentVehicleEntities: AnimatedVehicle[] = [];
  private presentPassengerEntities: AnimatedPassenger[] = [];
  private presentStopEntities: AnimatedStop[] = [];

  private entitiesContainer = new Container();
  private polylinesContainer = new Container();
  private backgroundContainer = new Container();
  private mainContainer = new Container();

  private selectedEntityPolylines: Graphics[] = [];

  private filters: Set<string> = new Set<string>();
  private filterMode: EntityFilterMode = 'all';
  private shouldShowComplete = false;

  private shouldCenterMap = false;

  private shouldFindCloseEntities = false;

  private highlightedLegIndex: number | null = null;

  private clickEvent: LeafletMouseEvent | null = null;

  // MARK: Signals
  private readonly _selectedEntitySignal: WritableSignal<EntityMetadata | null> =
    signal(null);

  private readonly _preselectedEntitySignal: WritableSignal<
    (EntityMetadata & { shouldShowSelectedEntityTab: boolean }) | null
  > = signal(null);

  private readonly _clickPositionSignal: WritableSignal<LeafletPoint | null> =
    signal(null);

  private readonly _closeEntitiesSignal: WritableSignal<EntityMetadata[]> =
    signal([]);

  private readonly _shouldFollowEntitySignal: WritableSignal<boolean> =
    signal(false);

  // MARK: Constructor
  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly spritesService: SpritesService,
    private readonly taskService: TaskService,
  ) {
    void Assets.load(this.BITMAP_TEXT_URL);

    // Initialize containers (entities over polylines over background)
    this.mainContainer.addChild(this.backgroundContainer);
    this.mainContainer.addChild(this.polylinesContainer);
    this.mainContainer.addChild(this.entitiesContainer);
  }

  // MARK: Getters
  get closeEntitiesSignal(): Signal<EntityMetadata[]> {
    return this._closeEntitiesSignal;
  }

  get preselectedEntitySignal(): Signal<
    | (EntityMetadata & {
        shouldShowSelectedEntityTab: boolean;
      })
    | null
  > {
    return this._preselectedEntitySignal;
  }

  get selectedEntitySignal(): Signal<EntityMetadata | null> {
    return this._selectedEntitySignal;
  }

  get clickPositionSignal(): Signal<LeafletPoint | null> {
    return this._clickPositionSignal;
  }

  get shouldFollowEntitySignal(): Signal<boolean> {
    return this._shouldFollowEntitySignal;
  }

  // MARK: Setters
  setPause(pause: boolean) {
    this.nextIsPaused = pause;
  }

  setFilters(filters: Set<string>) {
    this.nextFilters = filters;
  }

  setFilterMode(filterMode: EntityFilterMode) {
    this.nextFilterMode = filterMode;
  }

  setShouldShowComplete(shouldShowComplete: boolean) {
    this.nextShouldShowComplete = shouldShowComplete;
  }

  setSpeed(speed: number) {
    this.nextSpeed = speed;
  }

  toggleShouldFollowEntity() {
    this.nextShouldFollowEntity = !this.nextShouldFollowEntity;
  }

  centerMap() {
    this.nextShouldFollowEntity = false;

    this.nextShouldCenterMap = true;
  }

  highlightLeg(legIndex: number) {
    this.nextHighlightedLegIndex = legIndex;
  }

  unhighlightLeg() {
    this.nextHighlightedLegIndex = null;
  }

  preselectEntity(
    entityMetadata: EntityMetadata,
    shouldShowSelectedEntityTab: boolean,
  ) {
    this._preselectedEntitySignal.set({
      ...entityMetadata,
      shouldShowSelectedEntityTab,
    });
  }

  unpreselectEntity() {
    this._preselectedEntitySignal.set(null);
  }

  selectEntity(entity: EntityMetadata) {
    this._preselectedEntitySignal.set(null);
    this._selectedEntitySignal.set(entity);
  }

  unselectEntity() {
    this._selectedEntitySignal.set(null);
    this.nextHighlightedLegIndex = null;
  }

  clickHandled() {
    this.nextClickEvent = null;
    this.nextShouldFindCloseEntities = false;
  }

  // MARK: Public Methods
  updateEnvironment(continuousEnvironments: ContinuousEnvironment[]) {
    this.nextContinuousEnvironments = continuousEnvironments;
  }

  updateWantedVisualizationTime(wantedVisualizationTime: number | null): void {
    this.nextWantedVisualizationTime = wantedVisualizationTime;
  }

  updatePolylines(polylines: AllPolylines | null) {
    this.nextPolylines = polylines;
  }

  clearAnimations() {
    this.nextContinuousEnvironments = [];
    this.nextWantedVisualizationTime = null;
    this.nextPolylines = null;
    this.nextIsPaused = false;
    this.nextSpeed = 1;
    this.nextFilters.clear();
    this.nextFilterMode = 'all';
    this.nextShouldShowComplete = false;
    this.nextShouldCenterMap = false;
    this.nextShouldFollowEntity = false;
    this.nextClickEvent = null;
    this.nextHighlightedLegIndex = null;

    this.continuousEnvironments = [];

    this.wantedVisualizationTime = null;
    this.animationVisualizationTime = 0;

    this.polylines = null;

    this.hasCenteredInitially = false;

    this.isPaused = false;
    this.speed = 1;

    this.vehicleEntities = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};
    this.stopEntities = [];
    this.stopEntitiesByPosition = {};

    this.entitiesContainer.removeChildren();
    this.backgroundContainer.removeChildren();

    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());

    this.filters.clear();
    this.filterMode = 'all';
    this.shouldShowComplete = false;

    this.shouldCenterMap = false;

    this.nextShouldFindCloseEntities = false;

    this.clickEvent = null;

    this.highlightedLegIndex = null;

    this._selectedEntitySignal.set(null);

    this._preselectedEntitySignal.set(null);

    this._clickPositionSignal.set(null);

    this._closeEntitiesSignal.set([]);

    this._shouldFollowEntitySignal.set(false);
  }

  // MARK: Initialization
  addPixiOverlay(map: Map) {
    map.on('click', (event) => {
      this.onClick(event);
    });

    const pixiLayer = (() => {
      return pixiOverlay(
        (utils, event) => {
          if (event.type === 'redraw') {
            this.onRedraw(utils);
          }
          utils.getRenderer().render(this.mainContainer);
        },
        this.mainContainer,
        {
          doubleBuffering: true,
        },
      );
    })();

    pixiLayer.addTo(map);

    const ticker = new Ticker();

    let lastRedrawTime = Number.POSITIVE_INFINITY;

    ticker.add((delta) => {
      pixiLayer.redraw({ type: 'redraw', delta: delta } as LeafletEvent);

      this.taskService.processTasks(lastRedrawTime + this.MIN_TIME_PER_FRAME);

      lastRedrawTime = performance.now();
    });

    ticker.start();
  }

  // MARK: Animation
  private onRedraw(utils: PixiOverlayUtils) {
    this.continuousEnvironments = this.nextContinuousEnvironments;
    this.wantedVisualizationTime = this.nextWantedVisualizationTime;
    this.polylines = this.nextPolylines;
    this.isPaused = this.nextIsPaused;
    this.speed = this.nextSpeed;
    this.filters = this.nextFilters;
    this.filterMode = this.nextFilterMode;
    this.shouldShowComplete = this.nextShouldShowComplete;
    this.shouldCenterMap = this.nextShouldCenterMap;
    this.nextShouldCenterMap = false; // This is not a toggle, so reset it after use
    this.clickEvent = this.nextClickEvent;
    this.highlightedLegIndex = this.nextHighlightedLegIndex;
    this.shouldFindCloseEntities = this.nextShouldFindCloseEntities;
    this._shouldFollowEntitySignal.set(this.nextShouldFollowEntity);

    if (this.wantedVisualizationTime === null) {
      return; // Unknown wanted visualization time
    }

    if (this.continuousEnvironments.length === 0) {
      return; // No continuous environments available
    }

    if (this.polylines === null) {
      return; // No polylines available
    }

    this.updateAnimationTime();

    const continuousEnvironment = findClosestContinuousEnvironment(
      this.continuousEnvironments,
      this.animationVisualizationTime,
    );

    if (continuousEnvironment === null) {
      return; // Environment not available
    }

    const environment = sliceEnvironment(
      continuousEnvironment,
      this.animationVisualizationTime,
    );

    this.spritesService.calculateSpriteScales(utils);

    this.resetEntities();
    this.createEntities(environment, utils);
    this.filterEntities(environment);

    const selectedEntity = this.updateSelectedEntity();
    const preselectedEntity = this.updatePreselectedEntity();

    const currentEntity = preselectedEntity ?? selectedEntity;

    this.updateEntities();
    this.setEntityPositions(utils);

    this.updateCounters();
    this.highlightSelectedEntity(currentEntity);
    this.updateTextures();
    this.drawSelectedEntityPolylines(currentEntity, utils);

    this.setMapPosition(currentEntity, utils);

    this.findCloseEntities(utils);
  }

  private updateAnimationTime() {
    if (this.wantedVisualizationTime === null) {
      return; // Unknown wanted visualization time
    }

    // Verify that there is a continuous path from the current time to the wanted time
    const minimum = Math.min(
      this.wantedVisualizationTime,
      this.animationVisualizationTime,
    );
    const maximum = Math.max(
      this.wantedVisualizationTime,
      this.animationVisualizationTime,
    );
    if (!isIntervalCovered(this.continuousEnvironments, minimum, maximum)) {
      this.animationVisualizationTime = this.wantedVisualizationTime;
      return; // No continuous path from current time to wanted time
    }

    const deltaSeconds = Ticker.shared.deltaMS / 1000;

    if (!this.isPaused) {
      this.animationVisualizationTime += deltaSeconds * this.speed;
    } else {
      this.animationVisualizationTime = this.wantedVisualizationTime;
    }

    const desynchronizationDifference =
      this.wantedVisualizationTime - this.animationVisualizationTime;
    if (
      Math.abs(desynchronizationDifference) >
      this.MAXIMUM_ALLOWED_DESYNCHRONIZATION_DIFFERENCE * this.speed
    ) {
      this.animationVisualizationTime +=
        desynchronizationDifference *
        (1 - Math.exp(-5 * Math.abs(deltaSeconds)));
    }
  }

  private onClick(event: LeafletMouseEvent) {
    this.nextClickEvent = event;
    this.nextShouldFindCloseEntities = true;
  }

  // MARK: Entity reset
  private resetEntities() {
    for (const vehicle of this.vehicleEntities) {
      vehicle.isPresent = false;
      vehicle.isPreselected = false;
      vehicle.isSelected = false;
      vehicle.isVisible = false;
      vehicle.isFiltered = false;
      vehicle.entity.error = null;
      vehicle.additionalInformation.passengerIds = [];
      vehicle.additionalInformation.numberOfPassengers = 0;
      vehicle.additionalInformation.numberOfNotVisiblePassengers = 0;
      vehicle.additionalInformation.stop = null;
      vehicle.additionalInformation.polylines = [];
      vehicle.additionalInformation.polylineIndex = null;
      vehicle.additionalInformation.polylineSegmentIndex = null;
      vehicle.additionalInformation.polylineSegmentProgress = null;
    }

    for (const passenger of this.passengersEntities) {
      passenger.isPresent = false;
      passenger.isPreselected = false;
      passenger.isSelected = false;
      passenger.isVisible = false;
      passenger.isFiltered = false;
      passenger.entity.error = null;
      passenger.additionalInformation.stop = null;
      passenger.additionalInformation.vehicle = null;
    }

    for (const stop of this.stopEntities) {
      stop.isPresent = false;
      stop.isPreselected = false;
      stop.isSelected = false;
      stop.isVisible = false;
      stop.isFiltered = false;
      stop.entity.error = null;
      stop.additionalInformation.passengerIds = [];
      stop.additionalInformation.numberOfPassengers = 0;
      stop.additionalInformation.numberOfCompletePassengers = 0;
      stop.additionalInformation.numberOfNotVisiblePassengers = 0;
      stop.additionalInformation.numberOfNotVisibleCompletePassengers = 0;
    }
  }

  // MARK: Entity creation
  private createEntities(
    environment: EnvironmentSlice,
    utils: PixiOverlayUtils,
  ) {
    this.presentVehicleEntities = [];
    this.presentPassengerEntities = [];
    this.presentStopEntities = [];

    for (const vehicle of Object.values(environment.vehicles)) {
      const currentVehicle = this.vehicleEntitiesByVehicleId[vehicle.id];
      if (currentVehicle === undefined) {
        this.addVehicle(vehicle);
      } else {
        currentVehicle.entity = vehicle;
        currentVehicle.isPresent = true;
        this.presentVehicleEntities.push(currentVehicle);
      }
    }

    for (const passenger of Object.values(environment.passengers)) {
      const currentPassenger =
        this.passengerEntitiesByPassengerId[passenger.id];
      if (currentPassenger === undefined) {
        this.addPassenger(passenger);
      } else {
        currentPassenger.entity = passenger;
        currentPassenger.isPresent = true;
        this.presentPassengerEntities.push(currentPassenger);
      }
    }

    for (const stop of Object.values(environment.stops)) {
      const currentStop = this.stopEntitiesByPosition[stop.id];
      if (currentStop === undefined) {
        this.addStop(stop, utils);
      } else {
        currentStop.entity = stop;
        currentStop.isPresent = true;
        this.presentStopEntities.push(currentStop);
      }
    }
  }

  private addVehicle(vehicle: Vehicle): void {
    const vehicleContainer = new Container();
    const backgroundContainer = new Container();

    // Vehicle background shape
    const graphics = new Graphics();
    backgroundContainer.addChild(graphics);

    // Vehicle Icon
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0.5);
    vehicleContainer.addChild(sprite);

    // Vehicle passenger count text
    const passengerCountText = new BitmapText('', this.BITMAP_TEXT_STYLE);
    vehicleContainer.addChild(passengerCountText);

    // Vehicle Passenger Icon
    const passengerIcon = new Sprite();
    passengerIcon.anchor.set(0.5, 0.5);
    vehicleContainer.addChild(passengerIcon);

    const entity: AnimatedVehicle = {
      entity: vehicle,
      additionalInformation: {
        passengerIds: [],
        numberOfPassengers: 0,
        numberOfNotVisiblePassengers: 0,
        stop: null,
        polylines: [],
        polylineIndex: null,
        polylineSegmentIndex: null,
        polylineSegmentProgress: null,
      },
      sprites: [sprite, passengerIcon],
      texts: [passengerCountText],
      graphics: [graphics],
      container: vehicleContainer,
      backgroundContainer: backgroundContainer,
      isPresent: true,
      isFiltered: false,
      isPreselected: false,
      isSelected: false,
      isVisible: false,
    };

    this.entitiesContainer.addChild(vehicleContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.vehicleEntities.push(entity);
    this.presentVehicleEntities.push(entity);

    this.vehicleEntitiesByVehicleId[vehicle.id] = entity;
  }

  private addPassenger(passenger: Passenger): void {
    const passengerContainer = new Container();
    const backgroundContainer = new Container();

    // Passenger Background shape
    const graphics = new Graphics();
    backgroundContainer.addChild(graphics);

    const entity: AnimatedPassenger = {
      entity: passenger,
      additionalInformation: {
        stop: null,
        vehicle: null,
      },
      sprites: [],
      texts: [],
      graphics: [graphics],
      container: passengerContainer,
      backgroundContainer: backgroundContainer,
      isPresent: true,
      isFiltered: false,
      isPreselected: false,
      isSelected: false,
      isVisible: false,
    };

    this.entitiesContainer.addChild(passengerContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.passengersEntities.push(entity);
    this.presentPassengerEntities.push(entity);

    this.passengerEntitiesByPassengerId[passenger.id] = entity;
  }

  private addStop(stop: Stop, utils: PixiOverlayUtils): void {
    const stopContainer = new Container();
    const backgroundContainer = new Container();

    // Background shape
    const graphics = new Graphics();
    backgroundContainer.addChild(graphics);

    // Sprite
    const sprite = new Sprite();
    sprite.anchor.set(0.5, 0.5);
    stopContainer.addChild(sprite);

    // Number of passengers
    const passengerCountText = new BitmapText('', this.BITMAP_TEXT_STYLE);
    stopContainer.addChild(passengerCountText);

    // Number of complete passengers
    const completePassengerCountText = new BitmapText(
      '',
      this.BITMAP_TEXT_STYLE,
    );
    stopContainer.addChild(completePassengerCountText);

    // Passenger Icon
    const passengerIcon = new Sprite();
    passengerIcon.anchor.set(0.5, 0.5);
    stopContainer.addChild(passengerIcon);

    const entity: AnimatedStop = {
      entity: stop,
      additionalInformation: {
        passengerIds: [],
        numberOfPassengers: 0,
        numberOfCompletePassengers: 0,
        numberOfNotVisiblePassengers: 0,
        numberOfNotVisibleCompletePassengers: 0,
      },
      sprites: [sprite, passengerIcon],
      texts: [passengerCountText, completePassengerCountText],
      graphics: [graphics],
      container: stopContainer,
      backgroundContainer: backgroundContainer,
      isPresent: true,
      isFiltered: false,
      isPreselected: false,
      isSelected: false,
      isVisible: false,
    };

    // Position
    const point = utils.latLngToLayerPoint([
      stop.position.latitude,
      stop.position.longitude,
    ]);
    stopContainer.x = point.x;
    stopContainer.y = point.y;

    this.entitiesContainer.addChild(stopContainer);
    this.backgroundContainer.addChild(backgroundContainer);
    this.stopEntities.push(entity);
    this.presentStopEntities.push(entity);

    this.stopEntitiesByPosition[stop.id] = entity;
  }

  // MARK: Filters
  private filterEntities(environment: EnvironmentSlice) {
    const filters = this.filters;

    const shouldShowVehicles = !filters.has('vehicle');
    const shouldShowPassengers = !filters.has('passenger');
    const shouldShowStops = !filters.has('stops');
    const shouldShowFavoritesOnly = this.filterMode === 'favorites';
    const shouldShowComplete = this.shouldShowComplete;

    for (const vehicle of this.presentVehicleEntities) {
      vehicle.isVisible =
        environment.vehicles[vehicle.entity.id] !== undefined && // Is vehicle in the environment
        shouldShowVehicles && // Are vehicles not filtered
        !filters.has(vehicle.entity.mode ?? 'unknown') && // Is mode not filtered
        (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.isFavoriteEntity(vehicle.entity)) &&
        (shouldShowComplete || // Is complete filter on or is not complete
          vehicle.entity.status !== 'complete');
      vehicle.isFiltered = !vehicle.isVisible;
    }

    for (const passenger of this.presentPassengerEntities) {
      passenger.isVisible =
        environment.passengers[passenger.entity.id] !== undefined && // Is passenger in the environment
        shouldShowPassengers && // Are passengers not filtered
        (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.isFavoriteEntity(passenger.entity)) &&
        (shouldShowComplete || // Is complete filter on or is not complete
          passenger.entity.status !== 'complete');

      passenger.isFiltered = !passenger.isVisible;
    }

    for (const stop of this.presentStopEntities) {
      stop.isVisible =
        environment.stops[stop.entity.id] !== undefined && // Is stop in the environment
        shouldShowStops && // Are stops not filtered
        (!shouldShowFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.isFavoriteEntity(stop.entity));

      stop.isFiltered = !stop.isVisible;
    }
  }

  // MARK: Entity update
  private updatePreselectedEntity(): AnimatedEntity | null {
    const preselectedEntity = this._preselectedEntitySignal();

    if (preselectedEntity !== null) {
      switch (preselectedEntity.entityType) {
        case 'vehicle': {
          const vehicle = this.vehicleEntitiesByVehicleId[preselectedEntity.id];
          if (vehicle && vehicle.isPresent) {
            vehicle.isPreselected = true;
            vehicle.isVisible = true;
            return vehicle;
          } else {
            this._preselectedEntitySignal.set(null);
          }
          break;
        }
        case 'passenger': {
          const passenger =
            this.passengerEntitiesByPassengerId[preselectedEntity.id];
          if (passenger && passenger.isPresent) {
            passenger.isPreselected = true;
            passenger.isVisible = true;
            return passenger;
          } else {
            this._preselectedEntitySignal.set(null);
          }
          break;
        }
        case 'stop': {
          const stop = this.stopEntitiesByPosition[preselectedEntity.id];
          if (stop && stop.isPresent) {
            stop.isPreselected = true;
            stop.isVisible = true;
            return stop;
          } else {
            this._preselectedEntitySignal.set(null);
          }
          break;
        }
      }
    }

    return null;
  }

  private hadSelectedEntity = false;

  private updateSelectedEntity(): AnimatedEntity | null {
    // If another entity is preselected, we do not select the current one
    const preselectedEntity = this._preselectedEntitySignal();
    if (preselectedEntity !== null) {
      this.hadSelectedEntity = false;
      return null;
    }

    const selectedEntity = this._selectedEntitySignal();
    if (selectedEntity === null) {
      this.hadSelectedEntity = false;
      return null; // No selected entity
    }

    switch (selectedEntity.entityType) {
      case 'vehicle': {
        const vehicle = this.vehicleEntitiesByVehicleId[selectedEntity.id];
        if (vehicle && vehicle.isPresent) {
          vehicle.isSelected = true;
          vehicle.isVisible = true;

          if (!this.hadSelectedEntity) {
            this.hadSelectedEntity = true;
          }
          return vehicle;
        } else {
          this._selectedEntitySignal.set(null);
        }
        break;
      }
      case 'passenger': {
        const passenger =
          this.passengerEntitiesByPassengerId[selectedEntity.id];
        if (passenger && passenger.isPresent) {
          passenger.isSelected = true;
          passenger.isVisible = true;

          if (!this.hadSelectedEntity) {
            this.hadSelectedEntity = true;
          }
          return passenger;
        } else {
          this._selectedEntitySignal.set(null);
        }
        break;
      }
      case 'stop': {
        const stop = this.stopEntitiesByPosition[selectedEntity.id];
        if (stop && stop.isPresent) {
          stop.isSelected = true;
          stop.isVisible = true;

          if (!this.hadSelectedEntity) {
            this.hadSelectedEntity = true;
          }
          return stop;
        } else {
          this._selectedEntitySignal.set(null);
        }
        break;
      }
    }

    return null;
  }

  private updateEntities() {
    this.updateOnPassengerLegs();
    this.updateOnVehicleStops();
  }

  private updateOnPassengerLegs() {
    for (const passenger of this.presentPassengerEntities) {
      const leg =
        passenger.entity.currentLeg ??
        passenger.entity.nextLegs[0] ?? // Take next leg if no current leg
        passenger.entity.previousLegs[ // Take previous leg if no current or next leg
          passenger.entity.previousLegs.length - 1
        ] ??
        null;

      if (leg === null) {
        passenger.isVisible = false;
        passenger.entity.error = 'No leg'; // This sometimes happens
        continue;
      }

      // Is at boarding stop
      if (
        leg.boardingTime === null ||
        leg.boardingTime > this.animationVisualizationTime
      ) {
        if (leg.boardingStopId === null) {
          passenger.isVisible = false;
          passenger.entity.error = 'No boarding stop'; // This sometimes happens
          continue;
        }

        const stop = this.stopEntitiesByPosition[leg.boardingStopId];

        if (stop === undefined) {
          passenger.isVisible = false;
          passenger.entity.error = 'Boarding stop not found';
          continue;
        }

        if (!stop.isPresent) {
          passenger.isVisible = false;
          passenger.entity.error = 'Boarding stop not present';
          continue;
        }

        // If the passenger is not visible, only update the additional information
        // of the stop for the counters.
        // The only way a passenger can be not visible is if it has been filtered.
        if (!passenger.isVisible) {
          if (passenger.entity.status === 'complete') {
            stop.additionalInformation.numberOfNotVisibleCompletePassengers +=
              passenger.entity.numberOfPassengers;
          } else {
            stop.additionalInformation.numberOfNotVisiblePassengers +=
              passenger.entity.numberOfPassengers;
          }
          continue;
        }

        stop.isVisible = true; // A stop with a visible passenger is always visible
        stop.additionalInformation.passengerIds.push(passenger.entity.id);
        if (passenger.entity.status === 'complete') {
          stop.additionalInformation.numberOfCompletePassengers +=
            passenger.entity.numberOfPassengers;
        } else {
          stop.additionalInformation.numberOfPassengers +=
            passenger.entity.numberOfPassengers;
        }
        passenger.additionalInformation.stop = stop;

        continue;
      }

      // Is in vehicle
      if (
        leg.alightingTime === null ||
        leg.alightingTime > this.animationVisualizationTime
      ) {
        if (leg.assignedVehicleId === null) {
          passenger.isVisible = false;
          passenger.entity.error = 'No vehicle';
          continue;
        }

        const vehicle = this.vehicleEntitiesByVehicleId[leg.assignedVehicleId];

        if (vehicle === undefined) {
          passenger.isVisible = false;
          passenger.entity.error = 'Vehicle not found';
          continue;
        }

        if (!vehicle.isPresent) {
          passenger.isVisible = false;
          passenger.entity.error = 'Vehicle not present';
          continue;
        }

        // If the passenger is not visible, only update the additional information
        // of the vehicle for the counters.
        // The only way a passenger can be not visible is if it has been filtered.
        if (!passenger.isVisible) {
          vehicle.additionalInformation.numberOfNotVisiblePassengers +=
            passenger.entity.numberOfPassengers;
          continue;
        }

        vehicle.isVisible = true; // A vehicle with a visible passenger is always visible
        vehicle.additionalInformation.passengerIds.push(passenger.entity.id);
        vehicle.additionalInformation.numberOfPassengers +=
          passenger.entity.numberOfPassengers;
        passenger.additionalInformation.vehicle = vehicle;

        continue;
      }

      // Is at alighting stop
      if (leg.alightingStopId === null) {
        passenger.isVisible = false;
        passenger.entity.error = 'No alighting stop';
        continue;
      }

      const stop = this.stopEntitiesByPosition[leg.alightingStopId];

      if (stop === undefined) {
        passenger.isVisible = false;
        passenger.entity.error = 'Alighting stop not found';
        continue;
      }

      if (!stop.isPresent) {
        passenger.isVisible = false;
        passenger.entity.error = 'Alighting stop not present';
        continue;
      }

      // If the passenger is not visible, only update the additional information
      // of the stop for the counters.
      // The only way a passenger can be not visible is if it has been filtered.
      if (!passenger.isVisible) {
        if (passenger.entity.status === 'complete') {
          stop.additionalInformation.numberOfNotVisibleCompletePassengers +=
            passenger.entity.numberOfPassengers;
        } else {
          stop.additionalInformation.numberOfNotVisiblePassengers +=
            passenger.entity.numberOfPassengers;
        }
        continue;
      }

      stop.isVisible = true; // A stop with a visible passenger is always visible
      stop.additionalInformation.passengerIds.push(passenger.entity.id);
      if (passenger.entity.status === 'complete') {
        stop.additionalInformation.numberOfCompletePassengers +=
          passenger.entity.numberOfPassengers;
      } else {
        stop.additionalInformation.numberOfPassengers +=
          passenger.entity.numberOfPassengers;
      }
      passenger.additionalInformation.stop = stop;
    }
  }

  private updateOnVehicleStops() {
    for (const vehicle of this.presentVehicleEntities) {
      // Get polylines
      const allStops = getAllStops(vehicle.entity);
      for (let index = 0; index < allStops.length - 1; index++) {
        const stop = allStops[index];
        const nextStop = allStops[index + 1];

        // Polylines are not null because of the check in onRedraw
        const polyline: Polyline =
          this.polylines!.polylinesByCoordinates[stop.id + ',' + nextStop.id];

        vehicle.additionalInformation.polylines.push(polyline);
      }

      // Vehicle is at a stop
      if (vehicle.entity.currentStop !== null) {
        const stop = this.stopEntitiesByPosition[vehicle.entity.currentStop.id];

        if (stop === undefined) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Current stop not found';
          continue;
        }

        if (!stop.isPresent) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Current stop not present';
          continue;
        }

        vehicle.additionalInformation.stop = stop;
        vehicle.additionalInformation.polylineIndex =
          vehicle.entity.previousStops.length - 1;
        const polyline =
          vehicle.additionalInformation.polylines[
            vehicle.additionalInformation.polylineIndex
          ];
        if (polyline !== undefined) {
          vehicle.additionalInformation.polylineSegmentIndex =
            polyline.coefficients.length - 1;
          vehicle.additionalInformation.polylineSegmentProgress = 1;
        } else {
          vehicle.additionalInformation.polylineSegmentIndex = 0;
          vehicle.additionalInformation.polylineSegmentProgress = 0;
        }
      }

      // Vehicle is moving
      else {
        if (vehicle.entity.previousStops.length === 0) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'No previous stops';
          continue;
        }
        const previousStop =
          vehicle.entity.previousStops[vehicle.entity.previousStops.length - 1];
        const previousStopEntity = this.stopEntitiesByPosition[previousStop.id];

        if (previousStopEntity === null) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Previous stop not found';
          continue;
        }

        if (!previousStopEntity.isPresent) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Previous stop not present';
          continue;
        }

        if (vehicle.entity.nextStops.length === 0) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'No next stops';
          continue;
        }

        const nextStop = vehicle.entity.nextStops[0];
        const nextStopEntity = this.stopEntitiesByPosition[nextStop.id];

        if (nextStopEntity === null) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Next stop not found';
          continue;
        }

        if (!nextStopEntity.isPresent) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Next stop not present';
          continue;
        }

        if (previousStop.departureTime === null) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'No departure time';
          continue;
        }

        const departureTime = previousStop.departureTime;
        const arrivalTime = nextStop.arrivalTime;

        const progress =
          (this.animationVisualizationTime - departureTime) /
          (arrivalTime - departureTime);

        if (progress < 0 || progress > 1) {
          vehicle.isVisible = false;
          vehicle.entity.error = 'Progress out of bounds';
          continue;
        }

        vehicle.additionalInformation.polylineIndex =
          vehicle.entity.previousStops.length - 1;

        const [segmentIndex, segmentProgress] = this.getSegmentIndexAndProgress(
          vehicle.additionalInformation.polylines[
            vehicle.additionalInformation.polylineIndex
          ],
          progress,
        );

        vehicle.additionalInformation.polylineSegmentIndex = segmentIndex;
        vehicle.additionalInformation.polylineSegmentProgress = segmentProgress;
      }
    }
  }

  // MARK: Entity positions
  private setEntityPositions(utils: PixiOverlayUtils) {
    this.setVehiclePositions(utils);
    this.setPassengerPositions();
  }

  private setVehiclePositions(utils: PixiOverlayUtils) {
    for (const vehicle of this.presentVehicleEntities) {
      if (vehicle.additionalInformation.stop !== null) {
        vehicle.container.x = vehicle.additionalInformation.stop.container.x;
        vehicle.container.y = vehicle.additionalInformation.stop.container.y;
      } else {
        const additionalInformation = vehicle.additionalInformation;

        if (additionalInformation.polylineIndex === null) {
          vehicle.container.visible = false;
          vehicle.entity.error = 'No polyline index';
          continue;
        }

        if (additionalInformation.polylineSegmentIndex === null) {
          vehicle.container.visible = false;
          vehicle.entity.error = 'No polyline segment index';
          continue;
        }

        if (additionalInformation.polylineSegmentProgress === null) {
          vehicle.container.visible = false;
          vehicle.entity.error = 'No polyline segment progress';
          continue;
        }

        const polylineIndex = additionalInformation.polylineIndex;
        const polyline = additionalInformation.polylines[polylineIndex];

        if (polyline === undefined) {
          vehicle.container.visible = false;
          vehicle.entity.error = 'Polyline not found';
          continue;
        }

        const firstPosition =
          polyline.polyline[additionalInformation.polylineSegmentIndex];
        const secondPosition =
          polyline.polyline[additionalInformation.polylineSegmentIndex + 1];

        if (firstPosition === undefined || secondPosition === undefined) {
          vehicle.container.visible = false;
          vehicle.entity.error = 'Segment not found';
          continue;
        }

        const startPoint = utils.latLngToLayerPoint([
          firstPosition.latitude,
          firstPosition.longitude,
        ]);
        const endPoint = utils.latLngToLayerPoint([
          secondPosition.latitude,
          secondPosition.longitude,
        ]);

        const interpolatedPoint = startPoint
          .multiplyBy(1 - additionalInformation.polylineSegmentProgress)
          .add(
            endPoint.multiplyBy(additionalInformation.polylineSegmentProgress),
          );

        vehicle.container.x = interpolatedPoint.x;
        vehicle.container.y = interpolatedPoint.y;

        const direction = endPoint.subtract(startPoint);
        const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
        vehicle.sprites[0].rotation = angle;
      }
    }
  }

  private setPassengerPositions() {
    for (const passenger of this.presentPassengerEntities) {
      if (passenger.additionalInformation.stop !== null) {
        passenger.container.x =
          passenger.additionalInformation.stop.container.x;
        passenger.container.y =
          passenger.additionalInformation.stop.container.y;
      } else if (passenger.additionalInformation.vehicle !== null) {
        passenger.container.x =
          passenger.additionalInformation.vehicle.container.x;
        passenger.container.y =
          passenger.additionalInformation.vehicle.container.y;
      } else {
        passenger.container.visible = false;
        passenger.entity.error = 'No stop or vehicle';
      }
    }
  }

  // MARK: Counters
  private updateCounters() {
    this.updateVehicleCounters();
    this.updateStopCounters();
  }

  private updateVehicleCounters() {
    const interpolate = d3InterpolateRgb(
      this.spritesService.currentColorPreset,
    );

    for (let index = 0; index < this.presentVehicleEntities.length; ++index) {
      const vehicle = this.vehicleEntities[index];

      const numberOfPassengers =
        vehicle.additionalInformation.numberOfPassengers;
      const numberOfNotVisiblePassengers =
        vehicle.additionalInformation.numberOfNotVisiblePassengers;
      const totalNumberOfPassengers =
        numberOfPassengers + numberOfNotVisiblePassengers;

      // If no visible passengers, do as if empty
      if (numberOfPassengers === 0) {
        vehicle.texts[0].text = '';
        vehicle.texts[0].tint = 0xffffff;
        vehicle.sprites[0].tint = 0xffffff;
        vehicle.sprites[1].tint = 0xffffff;
        continue;
      }
      // If only visible passengers, show only the number of passengers
      else if (numberOfNotVisiblePassengers === 0) {
        vehicle.texts[0].text = numberOfPassengers.toString();
      }
      // If both visible and not visible passengers, show both
      else {
        vehicle.texts[0].text = `${numberOfPassengers} (${totalNumberOfPassengers})`;
      }

      // Only count not complete passengers for the tint
      // but count not visible passengers
      const t = Math.min(
        1,
        (numberOfNotVisiblePassengers + numberOfPassengers) /
          vehicle.entity.capacity,
      );

      const color = d3Color(interpolate(t))?.rgb();

      if (color) {
        const tint = 256 * (color.r * 256 + color.g) + color.b;
        vehicle.texts[0].tint = tint;
        vehicle.sprites[0].tint = tint;
        vehicle.sprites[1].tint = tint;
      } else {
        console.warn('Color interpolation failed');
      }
    }
  }

  private updateStopCounters() {
    for (const stop of this.presentStopEntities) {
      const numberOfPassengers = stop.additionalInformation.numberOfPassengers;
      const numberOfCompletePassengers =
        stop.additionalInformation.numberOfCompletePassengers;
      const numberOfNotVisiblePassengers =
        stop.additionalInformation.numberOfNotVisiblePassengers;
      const numberOfNotVisibleCompletePassengers =
        stop.additionalInformation.numberOfNotVisibleCompletePassengers;
      const totalNumberOfPassengers =
        numberOfPassengers + numberOfNotVisiblePassengers;
      const totalNumberOfCompletePassengers =
        numberOfCompletePassengers + numberOfNotVisibleCompletePassengers;

      // If no visible passengers, do as if empty
      if (numberOfPassengers === 0) {
        stop.texts[0].text = '';
      }
      // If only visible passengers, show only the number of passengers
      else if (numberOfNotVisiblePassengers === 0) {
        stop.texts[0].text = numberOfPassengers.toString();
      }
      // If both visible and not visible passengers, show both
      else {
        stop.texts[0].text = `${numberOfPassengers} (${totalNumberOfPassengers})`;
      }

      // If no complete passengers, do as if empty
      if (numberOfCompletePassengers === 0) {
        stop.texts[1].text = '';
      }
      // If only visible complete passengers, show only the number of complete passengers
      else if (numberOfNotVisibleCompletePassengers === 0) {
        stop.texts[1].text = numberOfCompletePassengers.toString();
      }
      // If both visible and not visible complete passengers, show both
      else {
        stop.texts[1].text = `${numberOfCompletePassengers} (${totalNumberOfCompletePassengers})`;
      }

      if (numberOfPassengers === 0 && numberOfCompletePassengers === 0) {
        stop.texts[0].tint = 0xffffff;
        stop.texts[1].tint = 0xffffff;
        stop.sprites[0].tint = 0xffffff;
        stop.sprites[1].tint = 0xffffff;
        continue;
      }

      const interpolate = d3InterpolateRgb(
        this.spritesService.currentColorPreset,
      );

      // Only count not complete passengers for the tint
      // but count not visible passengers
      const t = Math.min(
        1,
        (numberOfNotVisiblePassengers + numberOfPassengers) /
          stop.entity.capacity,
      );

      const color = d3Color(interpolate(t))?.rgb();

      if (color) {
        const tint = 256 * (color.r * 256 + color.g) + color.b;
        stop.texts[0].tint = tint;
        stop.texts[1].tint = tint;
        stop.sprites[0].tint = tint;
        stop.sprites[1].tint = tint;
      } else {
        console.warn('Color interpolation failed');
      }
    }
  }

  // MARK: Highlighting
  private highlightSelectedEntity(selectedEntity: AnimatedEntity | null) {
    // Remove all filters from all entities
    for (const vehicle of this.presentVehicleEntities) {
      vehicle.container.filters = [];
    }

    for (const passenger of this.presentPassengerEntities) {
      passenger.container.filters = [];
    }

    for (const stop of this.presentStopEntities) {
      stop.container.filters = [];
    }

    if (selectedEntity !== null) {
      selectedEntity.container.filters = [
        new OutlineFilter(1, 0xffffff),
        new OutlineFilter(2, 0xffff00),
      ];

      if (isAnimatedPassenger(selectedEntity)) {
        if (selectedEntity.additionalInformation.vehicle !== null) {
          selectedEntity.additionalInformation.vehicle.container.filters = [
            new OutlineFilter(1, 0xffffff),
            new OutlineFilter(2, 0xffff00),
          ];
        }
        if (selectedEntity.additionalInformation.stop !== null) {
          selectedEntity.additionalInformation.stop.container.filters = [
            new OutlineFilter(1, 0xffffff),
            new OutlineFilter(2, 0xffff00),
          ];
        }
      }
    }
  }

  // MARK: Textures

  private updateTextures() {
    const showText = !this.spritesService.useZoomedOutSprites;

    this.vehicleEntities.forEach((vehicle) => {
      vehicle.container.visible = vehicle.isVisible;

      // Configure containers
      vehicle.container.scale.set(this.spritesService.vehicleSpriteScale);
      this.synchronizeBackgroundWithEntity(vehicle);

      if (!vehicle.isVisible) {
        return;
      }

      // Top right corner
      vehicle.texts[0].visible = showText;
      vehicle.texts[0].x = vehicle.sprites[0].width / 2;
      vehicle.texts[0].y = -vehicle.sprites[0].height / 2;

      this.spritesService.drawVehicleBackgroundShape(
        vehicle.graphics[0],
        vehicle.entity.mode,
        vehicle.entity.tags,
      );

      vehicle.sprites[0].texture = this.spritesService.getVehicleTexture(
        vehicle.entity.mode,
        vehicle.entity.tags,
      );

      // Passenger Icon
      vehicle.sprites[1].texture = this.spritesService.getPassengerTexture(
        vehicle.additionalInformation.passengerIds
          .map(
            (passengerId) =>
              this.passengerEntitiesByPassengerId[passengerId].entity.tags,
          )
          .flat(),
      );
      vehicle.sprites[1].visible =
        vehicle.additionalInformation.passengerIds.length > 0;
      vehicle.sprites[1].scale.set(
        this.spritesService.passengerSpriteScale /
          this.spritesService.vehicleSpriteScale,
      );
    });

    this.passengersEntities.forEach((passenger) => {
      passenger.container.visible = passenger.isVisible;

      // Configure container
      passenger.container.scale.set(this.spritesService.passengerSpriteScale);
      this.synchronizeBackgroundWithEntity(passenger);

      if (!passenger.isVisible) {
        return;
      }

      this.spritesService.drawPassengerBackgroundShape(
        passenger.graphics[0],
        passenger.entity.tags,
      );
    });

    this.stopEntities.forEach((stop) => {
      stop.container.visible = stop.isVisible;

      // Configure container
      stop.container.scale.set(this.spritesService.passengerSpriteScale);
      this.synchronizeBackgroundWithEntity(stop);

      if (!stop.isVisible) {
        return;
      }

      stop.sprites[0].texture = this.spritesService.getStopTexture(
        stop.entity.tags,
      );
      stop.sprites[0].scale.set(
        this.spritesService.stopSpriteScale /
          this.spritesService.passengerSpriteScale,
      );

      this.spritesService.drawStopBackgroundShape(
        stop.graphics[0],
        stop.entity.tags,
      );

      // Passenger Icon
      stop.sprites[1].texture = this.spritesService.getPassengerTexture(
        stop.additionalInformation.passengerIds
          .map(
            (passengerId) =>
              this.passengerEntitiesByPassengerId[passengerId].entity.tags,
          )
          .flat(),
      );
      stop.sprites[1].visible =
        stop.additionalInformation.passengerIds.length > 0;

      // Top right corner
      stop.texts[0].visible = showText;
      stop.texts[0].x = stop.sprites[1].width / 2;
      stop.texts[0].y = -stop.sprites[1].height / 2;

      // Bottom right corner
      stop.texts[1].visible = showText;
      stop.texts[1].x = stop.sprites[1].width / 2;
      stop.texts[1].y = stop.sprites[1].height / 2;
    });
  }

  private synchronizeBackgroundWithEntity(entity: AnimatedEntity) {
    entity.backgroundContainer.visible = entity.container.visible;
    entity.backgroundContainer.x = entity.container.x;
    entity.backgroundContainer.y = entity.container.y;
    entity.backgroundContainer.scale.x = entity.container.scale.x;
    entity.backgroundContainer.scale.y = entity.container.scale.y;
  }

  // MARK: Polylines
  private drawSelectedEntityPolylines(
    selectedEntity: AnimatedEntity | null,
    utils: PixiOverlayUtils,
  ) {
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());

    if (selectedEntity === null) {
      return;
    }

    if (isAnimatedPassenger(selectedEntity)) {
      this.drawPassengerPolylines(selectedEntity, utils);
    } else if (isAnimatedVehicle(selectedEntity)) {
      this.drawVehiclePolylines(selectedEntity, utils);
    }
  }

  private drawVehiclePolylines(
    vehicle: AnimatedVehicle,
    utils: PixiOverlayUtils,
  ) {
    const polylineIndex = vehicle.additionalInformation.polylineIndex;
    if (polylineIndex === null) {
      vehicle.entity.error =
        'No polyline index for vehicle ' +
        vehicle.entity.id +
        ' while drawing polylines';
      vehicle.isVisible = false;
      return;
    }

    const polylineSegmentIndex =
      vehicle.additionalInformation.polylineSegmentIndex;
    if (polylineSegmentIndex === null) {
      vehicle.entity.error =
        'No polyline segment index for vehicle ' +
        vehicle.entity.id +
        ' while drawing polylines';
      vehicle.isVisible = false;
      return;
    }

    const polylineSegmentProgress =
      vehicle.additionalInformation.polylineSegmentProgress;
    if (polylineSegmentProgress === null) {
      vehicle.entity.error =
        'No polyline segment progress for vehicle ' +
        vehicle.entity.id +
        ' while drawing polylines';
      vehicle.isVisible = false;
      return;
    }

    if (this.selectedEntityPolylines.length === 0) {
      this.addPolylineGraphics();
    }

    const polylines = vehicle.additionalInformation.polylines;

    this.drawPolylines(
      polylineIndex,
      polylineSegmentIndex,
      polylineSegmentProgress,
      polylines,
      this.selectedEntityPolylines[0],
      utils,
    );
  }

  private drawPassengerPolylines(
    passengerEntity: AnimatedPassenger,
    utils: PixiOverlayUtils,
  ) {
    const legs = getAllLegs(passengerEntity.entity);

    // If we have less entity polylines than legs, add the additional missing polylines
    while (this.selectedEntityPolylines.length < legs.length) {
      this.addPolylineGraphics();
    }

    for (let index = 0; index < legs.length; ++index) {
      const leg = legs[index];
      if (
        leg.assignedVehicleId === null ||
        leg.boardingStopIndex === null ||
        leg.alightingStopIndex === null
      )
        continue;

      const vehicle = this.vehicleEntitiesByVehicleId[leg.assignedVehicleId];

      if (vehicle === undefined) {
        passengerEntity.isVisible = false;
        passengerEntity.entity.error =
          'Vehicle not found for passenger ' + passengerEntity.entity.id;
        continue;
      }

      // Get polylines that passenger will be inside vehicle
      const passengerPath = vehicle.additionalInformation.polylines.slice(
        leg.boardingStopIndex,
        leg.alightingStopIndex,
      );

      const graphics = this.selectedEntityPolylines[index];

      if (graphics == null) return; // Safe check return when unknown bug

      const shouldHighlightLeg = index === this.highlightedLegIndex;
      if (shouldHighlightLeg) {
        graphics.filters = [
          new OutlineFilter(1, 0xffffff),
          new OutlineFilter(2, 0xffff00),
        ];
      } else {
        graphics.filters = [];
      }

      let currentPolylineIndex: number | null = null;
      let currentPolylineSegmentIndex: number | null = null;
      let currentPolylineSegmentProgress: number | null = null;

      switch (leg.legType) {
        case 'previous':
          currentPolylineIndex = passengerPath.length - 1;
          if (passengerPath[currentPolylineIndex] !== undefined) {
            currentPolylineSegmentIndex =
              passengerPath[currentPolylineIndex].coefficients.length - 1;
            currentPolylineSegmentProgress = 1;
          } else {
            currentPolylineSegmentIndex = 0;
            currentPolylineSegmentProgress = 0;
          }
          break;
        case 'current':
          if (
            vehicle.additionalInformation.polylineIndex === null ||
            vehicle.additionalInformation.polylineSegmentIndex === null ||
            vehicle.additionalInformation.polylineSegmentProgress === null
          ) {
            passengerEntity.entity.error =
              'No polyline index or segment index or progress for passenger';
            passengerEntity.isVisible = false;
            return;
          }
          currentPolylineIndex =
            vehicle.additionalInformation.polylineIndex - leg.boardingStopIndex;
          currentPolylineSegmentIndex =
            vehicle.additionalInformation.polylineSegmentIndex;
          currentPolylineSegmentProgress =
            vehicle.additionalInformation.polylineSegmentProgress;
          break;
        case 'next':
          currentPolylineIndex = 0;
          currentPolylineSegmentIndex = 0;
          currentPolylineSegmentProgress = 0;
          break;
      }

      if (
        currentPolylineIndex === null ||
        currentPolylineSegmentIndex === null ||
        currentPolylineSegmentProgress === null
      ) {
        passengerEntity.entity.error =
          'Invalid polyline index or segment index or progress for passenger';
        passengerEntity.isVisible = false;
        return;
      }

      this.drawPolylines(
        currentPolylineIndex,
        currentPolylineSegmentIndex,
        currentPolylineSegmentProgress,
        passengerPath,
        graphics,
        utils,
      );
    }
  }

  private drawPolylines(
    currentPolylineIndex: number,
    currentPolylineSegmentIndex: number,
    currentPolylineSegmentProgress: number,
    polylines: Polyline[],
    graphics: Graphics,
    utils: PixiOverlayUtils,
  ) {
    graphics.clear();

    if (polylines.length === 0) {
      return;
    }

    // Draw lines
    const width = Math.max(
      this.POLYLINE_WIDTH / utils.getScale(),
      this.POLYLINE_MIN_WIDTH,
    );
    graphics.lineStyle(
      width,
      this.POLYLINE_COMPLETE_COLOR,
      this.POLYLINE_ALPHA,
    );

    for (
      let polylineIndex = 0;
      polylineIndex < polylines.length;
      ++polylineIndex
    ) {
      const polyline = polylines[polylineIndex];

      if (polyline.polyline.length === 0) {
        console.warn(`Polyline at index ${polylineIndex} is empty.`);
        continue;
      }

      if (polylineIndex > currentPolylineIndex) {
        graphics.lineStyle(
          width,
          this.POLYLINE_REMAINING_COLOR,
          this.POLYLINE_ALPHA,
        );
      }

      const firstPoint = utils.latLngToLayerPoint([
        polyline.polyline[0].latitude,
        polyline.polyline[0].longitude,
      ]);
      graphics.moveTo(firstPoint.x, firstPoint.y);

      for (
        let polylineSegmentIndex = 1;
        polylineSegmentIndex < polyline.polyline.length;
        ++polylineSegmentIndex
      ) {
        if (
          polylineIndex === currentPolylineIndex &&
          polylineSegmentIndex === currentPolylineSegmentIndex + 1
        ) {
          const interpolatedPoint = utils
            .latLngToLayerPoint([
              polyline.polyline[polylineSegmentIndex].latitude,
              polyline.polyline[polylineSegmentIndex].longitude,
            ])
            .multiplyBy(currentPolylineSegmentProgress)
            .add(
              utils
                .latLngToLayerPoint([
                  polyline.polyline[polylineSegmentIndex - 1].latitude,
                  polyline.polyline[polylineSegmentIndex - 1].longitude,
                ])
                .multiplyBy(1 - currentPolylineSegmentProgress),
            );

          graphics.lineTo(interpolatedPoint.x, interpolatedPoint.y);
          graphics.lineStyle(
            width,
            this.POLYLINE_REMAINING_COLOR,
            this.POLYLINE_ALPHA,
          );
          graphics.moveTo(interpolatedPoint.x, interpolatedPoint.y);
          graphics.lineTo(interpolatedPoint.x, interpolatedPoint.y);
        } else {
          if (
            polylineIndex > currentPolylineIndex ||
            (polylineIndex === currentPolylineIndex &&
              polylineSegmentIndex > currentPolylineSegmentIndex)
          ) {
            graphics.lineStyle(
              width,
              this.POLYLINE_REMAINING_COLOR,
              this.POLYLINE_ALPHA,
            );
          }
          const point = utils.latLngToLayerPoint([
            polyline.polyline[polylineSegmentIndex].latitude,
            polyline.polyline[polylineSegmentIndex].longitude,
          ]);
          graphics.lineTo(point.x, point.y);
        }
      }
    }

    // Draw stops
    graphics.lineStyle(
      width,
      this.POLYLINE_COMPLETE_COLOR,
      this.POLYLINE_ALPHA,
    );
    for (
      let polylineIndex = 0;
      polylineIndex < polylines.length;
      ++polylineIndex
    ) {
      const polyline = polylines[polylineIndex];

      if (polyline.polyline.length === 0) {
        console.warn(`Polyline at index ${polylineIndex} is empty.`);
        continue;
      }

      if (
        polylineIndex > currentPolylineIndex ||
        (polylineIndex === currentPolylineIndex &&
          currentPolylineSegmentIndex === 0 &&
          currentPolylineSegmentProgress === 0)
      ) {
        graphics.lineStyle(
          width,
          this.POLYLINE_REMAINING_COLOR,
          this.POLYLINE_ALPHA,
        );
      }

      const point = utils.latLngToLayerPoint([
        polyline.polyline[polyline.polyline.length - 1].latitude,
        polyline.polyline[polyline.polyline.length - 1].longitude,
      ]);

      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(point.x, point.y, width * 1.2);
      graphics.endFill();
    }

    // Draw last stop
    if (currentPolylineIndex < polylines.length) {
      graphics.lineStyle(
        width,
        this.POLYLINE_REMAINING_COLOR,
        this.POLYLINE_ALPHA,
      );
    } else {
      graphics.lineStyle(
        width,
        this.POLYLINE_COMPLETE_COLOR,
        this.POLYLINE_ALPHA,
      );
    }

    const lastPolyline = polylines[polylines.length - 1];
    if (lastPolyline.polyline.length > 0) {
      const lastPoint = utils.latLngToLayerPoint([
        lastPolyline.polyline[lastPolyline.polyline.length - 1].latitude,
        lastPolyline.polyline[lastPolyline.polyline.length - 1].longitude,
      ]);
      graphics.beginFill(this.WHITE, 1);
      graphics.drawCircle(lastPoint.x, lastPoint.y, width * 1.2);
      graphics.endFill();
    } else {
      console.warn('Last polyline is empty, not drawing last stop.');
    }
  }

  private getSegmentIndexAndProgress(
    polyline: Polyline,
    progress: number,
  ): [number, number] {
    let cumulativeProgress = 0;
    let segmentIndex = null;
    let segmentProgress = null;

    for (let i = 0; i < polyline.coefficients.length; ++i) {
      const coefficient = polyline.coefficients[i];
      if (cumulativeProgress + coefficient >= progress) {
        segmentIndex = i;
        segmentProgress = (progress - cumulativeProgress) / coefficient;
        break;
      }
      cumulativeProgress += coefficient;
    }

    if (segmentIndex === null || segmentProgress === null) {
      return [polyline.coefficients.length - 1, 1];
    }

    return [segmentIndex, segmentProgress];
  }

  private addPolylineGraphics() {
    const newPolylineGraphics = new Graphics();
    this.selectedEntityPolylines.push(newPolylineGraphics);
    this.polylinesContainer.addChild(newPolylineGraphics);
  }

  // MARK: Map position
  private setMapPosition(
    selectedEntity: AnimatedEntity | null,
    utils: PixiOverlayUtils,
  ) {
    // Center on selected entity if it is visible
    if (
      this._shouldFollowEntitySignal() &&
      selectedEntity !== null &&
      selectedEntity.isVisible
    ) {
      utils
        .getMap()
        .setView(
          utils.layerPointToLatLng(
            new LeafletPoint(
              selectedEntity.container.x,
              selectedEntity.container.y,
            ),
          ),
        );
      return;
    }

    // Center on all entities if shouldCenterMap is true
    if (this.shouldCenterMap || !this.hasCenteredInitially) {
      this.shouldCenterMap = false;

      const allVisibleVehicleEntities = this.presentVehicleEntities.filter(
        (vehicle) => vehicle.isVisible,
      );
      const allVehicleEntitiesY = allVisibleVehicleEntities.map(
        (vehicle) => vehicle.container.y,
      );
      const allVehicleEntitiesX = allVisibleVehicleEntities.map(
        (vehicle) => vehicle.container.x,
      );

      const allVisiblePassengerEntities = this.presentPassengerEntities.filter(
        (passenger) => passenger.isVisible,
      );
      const allPassengerEntitiesY = allVisiblePassengerEntities.map(
        (passenger) => passenger.container.y,
      );
      const allPassengerEntitiesX = allVisiblePassengerEntities.map(
        (passenger) => passenger.container.x,
      );

      const allVisibleStops = this.presentStopEntities.filter(
        (stop) => stop.isVisible,
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

      const southWest = utils.layerPointToLatLng(
        new LeafletPoint(
          minimumLongitude - padding * horizontalDistance,
          minimumLatitude - padding * verticalDistance,
        ),
      );

      const northEast = utils.layerPointToLatLng(
        new LeafletPoint(
          maximumLongitude + padding * horizontalDistance,
          maximumLatitude + padding * verticalDistance,
        ),
      );

      utils.getMap().flyToBounds(new LatLngBounds(southWest, northEast));

      this.hasCenteredInitially = true;
    }
  }

  // MARK: Close entities
  private findCloseEntities(utils: PixiOverlayUtils) {
    if (!this.shouldFindCloseEntities) {
      return;
    }
    this.nextShouldFindCloseEntities = false;

    if (!this.clickEvent) {
      console.warn(
        'No click event to find close entities. Make sure to call findCloseEntities after a click event.',
      );
      return;
    }

    const point = utils.latLngToLayerPoint(this.clickEvent.latlng);

    const minimumDistance = 20 / utils.getScale();

    const closeVehicles: EntityMetadata[] = [];
    const closeStops: EntityMetadata[] = [];

    // Distances for all vehicles
    for (const vehicle of this.presentVehicleEntities) {
      if (!vehicle.isVisible) {
        continue;
      }

      const distance = this.distanceBetweenPoints(
        point,
        vehicle.container.position,
      );

      if (distance <= minimumDistance) {
        closeVehicles.push(vehicle.entity);
      }
    }

    // Distances for all stops
    for (const stop of this.presentStopEntities) {
      if (!stop.isVisible) {
        continue;
      }

      const distance = this.distanceBetweenPoints(
        point,
        stop.container.position,
      );

      if (distance <= minimumDistance) {
        closeStops.push(stop.entity);
      }
    }

    const allCloseEntities = [...closeVehicles, ...closeStops];

    // No entities
    if (allCloseEntities.length === 0) {
      this.unselectEntity();
      this._closeEntitiesSignal.set([]);
    }
    // One entity
    else if (allCloseEntities.length === 1) {
      this.selectEntity(allCloseEntities[0]);
      this._closeEntitiesSignal.set([]);
    }
    // More than one
    else {
      this.unselectEntity();

      this._clickPositionSignal.set(
        new LeafletPoint(
          this.clickEvent.containerPoint.x,
          this.clickEvent.containerPoint.y,
        ),
      );

      this._closeEntitiesSignal.set(allCloseEntities);
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
}
