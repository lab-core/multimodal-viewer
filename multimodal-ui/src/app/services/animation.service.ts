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
  DualTextEntity,
  Entity,
  EntityFilterMode,
  TextEntity,
} from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedStop,
  AnimatedVehicle,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
  getAllStops,
  getId,
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

  private readonly _clickPositionSignal: WritableSignal<PIXI.Point> = signal(
    new PIXI.Point(0, 0),
  );

  private readonly _nearVehiclesSignal: WritableSignal<string[]> = signal([]);
  private readonly _nearPassengersSignal: WritableSignal<string[]> = signal([]);
  private readonly _nearStopsSignal: WritableSignal<string[]> = signal([]);

  get nearVehiclesSignal(): Signal<string[]> {
    return this._nearVehiclesSignal;
  }

  get nearPassengersSignal(): Signal<string[]> {
    return this._nearPassengersSignal;
  }

  get nearStopsSignal(): Signal<string[]> {
    return this._nearStopsSignal;
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

  private readonly CAPACITY_COLORS = [
    '#ffffff',
    '#ccffcc',
    // Double yellow and triple orange and red to make it more important
    '#ffffb3',
    '#ffffb3',
    '#ffb980',
    '#ffb980',
    '#ff3333',
    '#ff3333',
  ];

  private readonly BITMAP_TEXT_URL = 'bitmap-fonts/custom-sans-serif.xml';
  private readonly BITMAP_TEXT_STYLE: Partial<PIXI.IBitmapTextStyle> = {
    fontName: 'custom-sans-serif',
    fontSize: 18,
  };

  private pause = false;
  private animationVisualizationTime = 0;
  private lastVisualisationTime = 0;

  private vehicles: TextEntity<AnimatedVehicle>[] = [];
  private vehicleEntitiesByVehicleId: Record<string, Entity<AnimatedVehicle>> =
    {};
  private passengersEntities: Entity<AnimatedPassenger>[] = [];
  private passengerEntitiesByPassengerId: Record<
    string,
    Entity<AnimatedPassenger>
  > = {};

  private passengerStopEntities: DualTextEntity<AnimatedStop>[] = [];
  private passengerStopEntitiesByPosition: Record<
    string,
    DualTextEntity<AnimatedStop>
  > = {};

  private container = new PIXI.Container();

  private startTimestamp: number | null = null;
  private endTimestamp: number | null = null;

  private lastScale = 0;

  private utils!: L.PixiOverlayUtils;

  private selectedEntityPolyline: PIXI.Graphics = new PIXI.Graphics();

  // Variable that are alive for a single frame (could probably improve)
  private frame_pointToFollow: L.LatLngExpression | null = null;

  private previousVehiclesEntities: Entity<AnimatedVehicle>[] = [];
  private previousPassengerEntities: Entity<AnimatedPassenger>[] = [];

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

  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly spriteService: SpritesService,
  ) {
    void PIXI.Assets.load(this.BITMAP_TEXT_URL);
  }

  synchronizeEnvironment(simulationEnvironment: AnimatedSimulationEnvironment) {
    // We need to interpolate the animation time to quickly join the current visualization time if there is
    // a continuous animation data between the last and the current visualization time, or else
    // set the animation time to the current visualization time.
    this.synchronizeTime(
      simulationEnvironment,
      simulationEnvironment.currentState.timestamp,
    );

    this.selectedEntityPolyline.clear();
    this.container.removeChildren();
    this.container.addChild(this.selectedEntityPolyline);
    this.previousVehiclesEntities = this.vehicles;
    this.previousPassengerEntities = this.passengersEntities;
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};

    let isSelectedVehicleInEnvironment = false;

    this.startTimestamp = simulationEnvironment.animationData.startTimestamp;
    this.endTimestamp = simulationEnvironment.animationData.endTimestamp;

    const selectedVehicleId = this._selectedVehicleIdSignal();
    const selectedPassengerId = this._selectedPassengerIdSignal();

    for (const vehicle of Object.values(
      simulationEnvironment.currentState.vehicles,
    )) {
      this.addVehicle(vehicle);
      if (selectedVehicleId !== null && vehicle.id == selectedVehicleId) {
        isSelectedVehicleInEnvironment = true;
        this.highlightEntityId(vehicle.id, 'vehicle');
      }
    }

    if (selectedVehicleId !== null && !isSelectedVehicleInEnvironment) {
      this.unselectVehicle();
      console.warn(
        'The vehicle you selected is not in the environment anymore. It has been deselected.',
      );
    }

    let isSelectedPassengerInEnvironment = false;

    for (const passenger of Object.values(
      simulationEnvironment.currentState.passengers,
    )) {
      this.addPassenger(passenger);
      if (selectedPassengerId !== null && passenger.id == selectedPassengerId) {
        isSelectedPassengerInEnvironment = true;
        this.highlightEntityId(passenger.id, 'passenger');
      }
    }

    if (selectedPassengerId !== null && !isSelectedPassengerInEnvironment) {
      this.unselectPassenger();
      console.warn(
        'The passenger you selected is not in the environment anymore. It has been deselected.',
      );
    }

    this.addPassengerStops();

    let isSelectedStopInEnvironment = false;
    const selectedStopId = this._selectedStopIdSignal();
    for (const stop of Object.values(
      simulationEnvironment.currentState.stops,
    )) {
      const stopId = getId(stop);
      if (selectedStopId !== null && stopId == selectedStopId) {
        isSelectedStopInEnvironment = true;
        this.highlightEntityId(stopId, 'stop');
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
    if (
      animatedSimulationEnvironment.currentState.timestamp != visualizationTime
    ) {
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
    const sprite = PIXI.Sprite.from(
      this.spriteService.getCurrentVehicleTexture(vehicle.mode ?? ''),
    );
    vehicleContainer.scale.set(this.spriteService.vehicleSpriteScale);
    sprite.anchor.set(0.5, 0.5); // Center texture on coordinate
    vehicleContainer.addChild(sprite);

    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    passengerCountText.visible = !this.spriteService.useZoomedOutSprites;
    // Position at the top right corner of the vehicle
    passengerCountText.x = sprite.width / 2;
    passengerCountText.y = -sprite.height / 2;
    vehicleContainer.addChild(passengerCountText);

    const entity: TextEntity<AnimatedVehicle> = {
      data: vehicle,
      sprite,
      text: passengerCountText,
      show: true,
    };

    this.container.addChild(vehicleContainer);
    this.vehicles.push(entity);
    this.vehicleEntitiesByVehicleId[vehicle.id] = entity;
  }

  private addPassenger(passenger: AnimatedPassenger): void {
    const sprite = PIXI.Sprite.from(
      this.spriteService.getCurrentPassengerTexture(),
    );
    sprite.anchor.set(0.5, 0.5); // Center texture on coordinate
    sprite.scale.set(this.spriteService.passengerSpriteScale);
    const passengerContainer = new PIXI.Container();
    passengerContainer.addChild(sprite);

    // Counter of passengers in a stop
    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    passengerCountText.visible = !this.spriteService.useZoomedOutSprites;
    // Position at the top right corner of the passenger
    passengerCountText.x = sprite.width / 2;
    passengerCountText.y = -sprite.height / 2;
    passengerContainer.addChild(passengerCountText);

    const entity: Entity<AnimatedPassenger> = {
      data: passenger,
      sprite,
      show: true,
    };

    this.container.addChild(passengerContainer);
    this.passengersEntities.push(entity);

    this.passengerEntitiesByPassengerId[passenger.id] = entity;
  }

  private addPassengerStops(): void {
    this.passengerStopEntities = [];
    this.passengerStopEntitiesByPosition = {};

    for (const vehicleEntity of this.vehicles) {
      const vehicle = vehicleEntity.data;
      const allStops = getAllStops(vehicle);
      for (const stop of allStops) {
        if (this.passengerStopEntitiesByPosition[getId(stop)] !== undefined)
          continue;

        const stopContainer = new PIXI.Container();
        stopContainer.scale.set(this.spriteService.passengerSpriteScale);

        // Sprite
        const sprite = PIXI.Sprite.from(
          this.spriteService.getCurrentPassengerTexture(),
        );
        sprite.anchor.set(0.5, 0.5);
        stopContainer.addChild(sprite);

        // Other sprite (for the stop without passengers)
        const otherSprite = PIXI.Sprite.from(this.spriteService.stopTexture);
        otherSprite.scale.set(0.25);
        otherSprite.anchor.set(0.5, 0.5);
        otherSprite.visible = false;
        stopContainer.addChild(otherSprite);

        // Number of passengers
        const passengerCountText = new PIXI.BitmapText(
          '',
          this.BITMAP_TEXT_STYLE,
        );
        passengerCountText.visible = !this.spriteService.useZoomedOutSprites;
        // Position at the top right corner of the stop
        passengerCountText.x = sprite.width / 2;
        passengerCountText.y = -sprite.height / 2;
        stopContainer.addChild(passengerCountText);

        const entity: DualTextEntity<AnimatedStop> = {
          data: {
            ...stop,
            passengerIds: [],
            vehicleIds: [],
            numberOfPassengers: 0,
          },
          sprite,
          otherSprite,
          text: passengerCountText,
          show: true,
        };

        // Position
        const point = this.utils.latLngToLayerPoint([
          stop.position.latitude,
          stop.position.longitude,
        ]);
        stopContainer.x = point.x;
        stopContainer.y = point.y;

        this.container.addChild(stopContainer);
        this.passengerStopEntities.push(entity);

        this.passengerStopEntitiesByPosition[getId(stop)] = entity;
      }
    }
  }

  clearAnimations() {
    this.container.removeChildren();
    this.vehicles = [];
    this.vehicleEntitiesByVehicleId = {};
    this.passengersEntities = [];
    this.passengerEntitiesByPassengerId = {};
    this.unselectEntity();
    this.previousVehiclesEntities = [];
    this.previousPassengerEntities = [];
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
    if (this.vehicles.length == 0) return;

    this.unselectVehicle();

    const allVehicleEntitiesY = this.previousVehiclesEntities
      .filter(
        (vehicle) =>
          vehicle.sprite.parent.visible &&
          (vehicle.sprite.parent.y != 0 || vehicle.sprite.parent.x != 0),
      )
      .map((vehicle) => vehicle.sprite.parent.y);
    const allVehicleEntitiesX = this.previousVehiclesEntities
      .filter(
        (vehicle) =>
          vehicle.sprite.parent.visible &&
          (vehicle.sprite.parent.y != 0 || vehicle.sprite.parent.x != 0),
      )
      .map((vehicle) => vehicle.sprite.parent.x);
    const allPassengerEntitiesY = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprite.parent.visible &&
          (passenger.sprite.parent.y != 0 || passenger.sprite.parent.x != 0),
      )
      .map((passenger) => passenger.sprite.parent.y);
    const allPassengerEntitiesX = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprite.parent.visible &&
          (passenger.sprite.parent.y != 0 || passenger.sprite.parent.x != 0),
      )
      .map((passenger) => passenger.sprite.parent.x);

    const allEntitiesY = allVehicleEntitiesY.concat(allPassengerEntitiesY);
    const allEntitiesX = allVehicleEntitiesX.concat(allPassengerEntitiesX);

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
        this.favoriteEntitiesService
          .favPassengerIds()
          .has(passenger.data.id)) &&
      (shouldShowComplete || // Is complete filter on or is not complete
        passenger.data.status !== 'complete')
    );
  }

  private filterEntities() {
    const filters = this.filters;

    const showVehicles = !filters.has('vehicle');
    const showPassengers = !filters.has('passenger');
    const showFavoritesOnly = this.filterMode === 'favorites';
    const shouldShowComplete = this.shouldShowComplete;

    for (const vehicle of this.vehicles) {
      vehicle.sprite.parent.visible =
        vehicle.show &&
        showVehicles && // Are vehicles not filtered
        !filters.has(vehicle.data.mode ?? 'unknown') && // Is mode not filtered
        (!showFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.favVehicleIds().has(vehicle.data.id)) &&
        (shouldShowComplete || // Is complete filter on or is not complete
          vehicle.data.status !== 'complete');

      vehicle.data.passengerIds = vehicle.data.passengerIds.filter(
        (passengerId) => {
          const passenger = this.passengerEntitiesByPassengerId[passengerId];
          return this.isPassengerFiltered(
            passenger,
            showPassengers,
            showFavoritesOnly,
            shouldShowComplete,
          );
        },
      );
    }

    for (const passenger of this.passengersEntities)
      passenger.sprite.parent.visible =
        passenger.show &&
        this.isPassengerFiltered(
          passenger,
          showPassengers,
          showFavoritesOnly,
          shouldShowComplete,
        );

    // Same for passengers since these stops are only shown when passengers are waiting
    // Filter the passengers of the stop instead of changing the stop container
    for (const stop of this.passengerStopEntities)
      stop.data.passengerIds = stop.data.passengerIds.filter((passengerId) => {
        const passenger = this.passengerEntitiesByPassengerId[passengerId];
        return this.isPassengerFiltered(
          passenger,
          showPassengers,
          showFavoritesOnly,
          shouldShowComplete,
        );
      });
  }

  private setVehiclePositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicleEntity = this.vehicles[index];
      const vehicle = vehicleEntity.data;

      vehicle.passengerIds = [];
      vehicle.numberOfPassengers = 0;

      if (!vehicle.animationData) {
        vehicleEntity.show = false;
        continue;
      }

      const animationData = vehicle.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Vehicle has no animation data
      // This can happen if the vehicle is not in the environment yet
      if (!animationData) {
        vehicleEntity.show = false;
        continue;
      }

      vehicle.status = animationData.status;

      const polylineIndex: number =
        animationData.displayedPolylines.currentPolylineIndex;
      let point: L.Point | null = null;
      if (animationData.notDisplayedReason !== null) {
        // Vehicle has an error
        vehicleEntity.show = false;
        // console.error(
        //   `Vehicle ${vehicle.id} has an error: ${animationData.notDisplayedReason}`,
        // );
      } else if (
        (animationData as StaticVehicleAnimationData).position !== undefined
      ) {
        vehicleEntity.show = true;
        const staticVehicleAnimationData =
          animationData as StaticVehicleAnimationData;
        point = this.utils.latLngToLayerPoint([
          staticVehicleAnimationData.position.latitude,
          staticVehicleAnimationData.position.longitude,
        ]);
        vehicleEntity.sprite.parent.x = point.x;
        vehicleEntity.sprite.parent.y = point.y;
        vehicleEntity.data.currentLineIndex =
          polylineIndex === -1
            ? 0
            : (animationData.displayedPolylines.polylines[polylineIndex]
                ?.polyline.length ?? 0) - 1;
      } else if (
        (animationData as DynamicVehicleAnimationData).polyline !== undefined
      ) {
        vehicleEntity.show = true;
        const dynamicVehicleAnimationData =
          animationData as DynamicVehicleAnimationData;
        const [lineNo, lineProgress] = this.getLineNoAndProgress(
          dynamicVehicleAnimationData.displayedPolylines,
        );
        point = this.applyInterpolation(
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
        vehicleEntity.show = false;
      }

      const selectedVehicleId = this._selectedVehicleIdSignal();
      if (
        selectedVehicleId !== null &&
        selectedVehicleId === vehicle.id &&
        vehicleEntity.data.currentLineIndex !== null &&
        point !== null
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(point);
        this.redrawPolyline(
          polylineIndex,
          vehicleEntity.data.currentLineIndex,
          point,
          animationData.displayedPolylines.polylines,
        );
      }
    }
  }

  private setPassengerPositions() {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.passengersEntities.length; ++index) {
      const passengerEntity = this.passengersEntities[index];
      const passenger = passengerEntity.data;

      // Never show passengers
      passengerEntity.show = false;

      const animationData = passenger.animationData.find(
        (data) =>
          data.startTimestamp <= this.animationVisualizationTime &&
          data.endTimestamp! >= this.animationVisualizationTime,
      );

      // Passenger has no animation data
      // This can happen if the passenger is not in the environment yet
      if (!animationData) {
        continue;
      }

      passenger.status = animationData.status;

      if (animationData.notDisplayedReason !== null) {
        // Passenger has an error
      } else if (
        (animationData as StaticPassengerAnimationData).stopIndex !==
          undefined &&
        animationData.vehicleId !== null
      ) {
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        const allStops = getAllStops(vehicleEntity.data);
        const stop =
          allStops[(animationData as StaticPassengerAnimationData).stopIndex];
        if (stop !== undefined) {
          const point = this.utils.latLngToLayerPoint([
            stop.position.latitude,
            stop.position.longitude,
          ]);
          passengerEntity.sprite.parent.x = point.x;
          passengerEntity.sprite.parent.y = point.y;

          if (passenger.status !== 'complete') {
            const animatedStop =
              this.passengerStopEntitiesByPosition[getId(stop)];

            if (animatedStop) {
              animatedStop.data.passengerIds.push(passenger.id);
              animatedStop.data.numberOfPassengers +=
                passenger.numberOfPassengers;
            }
          }
        }
      } else if (
        (animationData as DynamicPassengerAnimationData).isOnBoard === true &&
        animationData.vehicleId !== null
      ) {
        const vehicleEntity =
          this.vehicleEntitiesByVehicleId[animationData.vehicleId];
        if (vehicleEntity) {
          vehicleEntity.data.passengerIds.push(passenger.id);
          vehicleEntity.data.numberOfPassengers += passenger.numberOfPassengers;
          passengerEntity.sprite.parent.x = vehicleEntity.sprite.parent.x;
          passengerEntity.sprite.parent.y = vehicleEntity.sprite.parent.y;
        }
      } else {
        // Passenger has an unknown error
      }

      const selectedPassengerId = this._selectedPassengerIdSignal();
      if (
        selectedPassengerId !== null &&
        selectedPassengerId === passenger.id
      ) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(
          new L.Point(
            passengerEntity.sprite.parent.x,
            passengerEntity.sprite.parent.y,
          ),
        );
        this.redrawPassengerPolyline();
      }
    }
  }

  private resetStopCounters() {
    for (const stopEntity of this.passengerStopEntities) {
      stopEntity.data.passengerIds = [];
      stopEntity.data.vehicleIds = [];
      stopEntity.data.numberOfPassengers = 0;
      stopEntity.text.text = '';
      stopEntity.sprite.tint = this.WHITE;
      stopEntity.sprite.parent.visible = true;
    }
  }

  private updateStopCounters() {
    for (const stopEntity of this.passengerStopEntities) {
      const passengers = stopEntity.data.passengerIds
        .map((passengerId) => this.passengerEntitiesByPassengerId[passengerId])
        .filter((passenger) => passenger !== undefined);

      const numberOfDisplayedPassengers = passengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );
      const numberOfPassengers = stopEntity.data.numberOfPassengers;

      if (numberOfDisplayedPassengers === 0) {
        stopEntity.sprite.parent.visible = false;
        continue;
      }

      if (numberOfDisplayedPassengers === numberOfPassengers) {
        stopEntity.text.text = numberOfPassengers.toString();
      } else {
        stopEntity.text.text = `${numberOfDisplayedPassengers} (${numberOfPassengers})`;
      }

      const interpolate = d3InterpolateRgb(this.CAPACITY_COLORS);

      const t = Math.min(1, numberOfPassengers / stopEntity.data.capacity);

      const color = d3Color(interpolate(t))?.rgb();

      if (color) {
        const tint = 256 * (color.r * 256 + color.g) + color.b;
        stopEntity.text.tint = tint;
        stopEntity.sprite.tint = tint;
      } else {
        console.warn('Color interpolation failed');
      }
    }

    if (this.filters.has('stops')) {
      return;
    }

    const showText = !this.spriteService.useZoomedOutSprites;
    for (const stopEntity of this.passengerStopEntities) {
      if (!stopEntity.sprite.parent.visible) {
        // Only show the stop image
        stopEntity.sprite.parent.visible = true;
        stopEntity.sprite.visible = false;
        stopEntity.text.visible = false;
        stopEntity.otherSprite.visible = true;
      } else {
        // Show the passenger image and the text
        stopEntity.sprite.visible = true;
        stopEntity.text.visible = showText;
        stopEntity.otherSprite.visible = false;
      }
    }
  }

  private followSelectedStop() {
    const selectedStopId = this._selectedStopIdSignal();

    if (selectedStopId === null) return;

    const stopEntity = this.passengerStopEntitiesByPosition[selectedStopId];

    if (stopEntity === undefined) return;

    const point = this.utils.layerPointToLatLng(
      new L.Point(stopEntity.sprite.parent.x, stopEntity.sprite.parent.y),
    );

    this.frame_pointToFollow = point;
  }

  private updateVehiclePassengerCounters() {
    const interpolate = d3InterpolateRgb(this.CAPACITY_COLORS);

    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let index = 0; index < this.vehicles.length; ++index) {
      const vehicleEntity = this.vehicles[index];

      const passengers = vehicleEntity.data.passengerIds.map(
        (passengerId) => this.passengerEntitiesByPassengerId[passengerId],
      );
      const numberOfDisplayedPassengers = passengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );

      const numberOfPassengers = vehicleEntity.data.numberOfPassengers;

      if (numberOfDisplayedPassengers === 0) vehicleEntity.text.text = '';
      else if (numberOfDisplayedPassengers === numberOfPassengers) {
        vehicleEntity.text.text = numberOfPassengers.toString();
      } else {
        vehicleEntity.text.text = `${numberOfDisplayedPassengers} (${numberOfPassengers})`;
      }

      const t = Math.min(1, numberOfPassengers / vehicleEntity.data.capacity);
      const color = d3Color(interpolate(t))?.rgb();
      if (!color) continue;

      const tint = 256 * (color.r * 256 + color.g) + color.b;
      vehicleEntity.text.tint = tint;
      vehicleEntity.sprite.tint = tint;
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

    vehicleEntity.sprite.parent.x = interpolatedPosition.x;
    vehicleEntity.sprite.parent.y = interpolatedPosition.y;

    // Set orientation
    const direction = pointB.subtract(pointA);
    const angle = -Math.atan2(direction.x, direction.y) + Math.PI / 2;
    vehicleEntity.sprite.rotation = angle;

    return interpolatedPosition;
  }

  private findVisuallyNearEntities(event: L.LeafletMouseEvent) {
    // 20 comes from half the size of the images in pixels
    const minVisualDistance = 20 / this.utils.getScale();
    const point = this.utils.latLngToLayerPoint(event.latlng);

    const nearVehicles = [];
    const nearPassengers = [];
    const nearStops = [];

    // Distances for all vehicles
    for (const vehicle of this.vehicles) {
      if (!vehicle.sprite.parent.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        vehicle.sprite.parent.position,
      );
      if (distance <= minVisualDistance) nearVehicles.push(vehicle.data.id);
    }

    // Distances for all passengers
    for (const passenger of this.passengersEntities) {
      if (!passenger.sprite.parent.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        passenger.sprite.parent.position,
      );
      if (distance <= minVisualDistance) nearPassengers.push(passenger.data.id);
    }

    // Distances for all stops
    for (const stop of this.passengerStopEntities) {
      if (
        !stop.sprite.parent.visible ||
        (!stop.sprite.visible && !stop.otherSprite.visible)
      )
        continue;
      const distance = this.distanceBetweenPoints(
        point,
        stop.sprite.parent.position,
      );
      if (distance <= minVisualDistance) nearStops.push(getId(stop.data));
    }

    const allNearEntities = [...nearVehicles, ...nearPassengers, ...nearStops];

    // No entities
    if (allNearEntities.length === 0) {
      this.unselectEntity();
    }
    // One vehicle
    else if (allNearEntities.length === 1 && nearVehicles.length === 1) {
      this.selectVehicle(nearVehicles[0]);
    }
    // One passenger
    else if (allNearEntities.length === 1 && nearPassengers.length === 1) {
      this.selectPassenger(nearPassengers[0]);
    }
    // One stop
    else if (allNearEntities.length === 1 && nearStops.length === 1) {
      this.selectStop(nearStops[0]);
    }
    // More than one
    else {
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

  private redrawPassengerPolyline() {
    const selectedPassengerId = this._selectedPassengerIdSignal();
    if (!selectedPassengerId) return;

    const passenger = this.passengerEntitiesByPassengerId[selectedPassengerId];
    if (!passenger) return;

    const passengerAnimationData = passenger.data.animationData.find(
      (data) =>
        data.startTimestamp <= this.animationVisualizationTime &&
        data.endTimestamp! >= this.animationVisualizationTime,
    );

    const legs = passenger.data.currentLeg
      ? [
          ...passenger.data.previousLegs,
          passenger.data.currentLeg,
          ...passenger.data.nextLegs,
        ]
      : [...passenger.data.previousLegs, ...passenger.data.nextLegs];

    const polylines: Polyline[] = [];

    let reachedCurrentVehicle = false;
    let calculatedPolylineNo = 0;
    let lineNo = 0;

    // Collect all polylines
    for (const leg of legs) {
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

      // When we reach our waiting/current vehicle
      if (vehicle.data.id === passengerAnimationData?.vehicleId) {
        reachedCurrentVehicle = true;

        const relativePolylineIndex =
          vehicleAnimationData.displayedPolylines.currentPolylineIndex -
          leg.boardingStopIndex;

        // When vehicle did not reach him yet
        if (relativePolylineIndex >= 0) {
          calculatedPolylineNo += relativePolylineIndex;
          lineNo = vehicle.data.currentLineIndex ?? 0;
        }
      } else if (!reachedCurrentVehicle)
        calculatedPolylineNo += passengerPath.length;

      polylines.push(...passengerPath);
    }
    if (polylines.length === 0) return;

    if (calculatedPolylineNo < 0) {
      calculatedPolylineNo = 0;
      lineNo = 0;
    }

    this.redrawPolyline(
      calculatedPolylineNo,
      lineNo,
      new L.Point(passenger.sprite.parent.x, passenger.sprite.parent.y),
      polylines,
    );
  }

  private redrawPolyline(
    polylineNo: number,
    lineNo: number,
    interpolatedPoint: L.Point,
    polylines: Polyline[],
  ) {
    const BASE_LINE_WIDTH = 4;
    const MIN_WIDTH = 0.04; // By testing out values
    const ALPHA = 0.9;
    const width = Math.max(BASE_LINE_WIDTH / this.utils?.getScale(), MIN_WIDTH);
    const graphics = this.selectedEntityPolyline;
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

      for (let j = 1; j <= lineNo; ++j) {
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
    this.spriteService.calculateSpriteScales(utils);
  }

  private onMoveEnd(event: L.LeafletEvent) {
    const scale = this.utils.getScale();
    if (scale != this.lastScale) this.onZoomEnd(event);
    this.lastScale = scale;
  }

  private onZoomEnd(event: L.LeafletEvent) {
    this.spriteService.calculateSpriteScales(this.utils);

    const passengerTexture = this.spriteService.getCurrentPassengerTexture();
    const showText = !this.spriteService.useZoomedOutSprites;

    this.vehicles.forEach((entity) => {
      entity.sprite.parent.scale.set(this.spriteService.vehicleSpriteScale);
      entity.sprite.texture = this.spriteService.getCurrentVehicleTexture(
        entity.data.mode,
      );
      entity.text.visible = showText;
    });

    this.passengersEntities.forEach((entity) => {
      entity.sprite.parent.scale.set(this.spriteService.passengerSpriteScale);
      entity.sprite.texture = passengerTexture;
    });

    this.passengerStopEntities.forEach((entity) => {
      entity.sprite.parent.scale.set(this.spriteService.passengerSpriteScale);
      entity.sprite.texture = passengerTexture;
      entity.text.visible = showText;
    });
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
    this.updateVehiclePassengerCounters();
    this.updateStopCounters();
    this.followSelectedStop();
  }

  // onClick is called after onEntityPointerdown
  private onClick(event: L.LeafletMouseEvent) {
    this.findVisuallyNearEntities(event);
  }

  private selectVehicle(vehicleId: string) {
    this.unselectEntity();
    this.highlightEntityId(vehicleId, 'vehicle');
    this._selectedVehicleIdSignal.set(vehicleId);
  }

  private selectPassenger(passengerId: string) {
    this.unselectEntity();
    this.highlightEntityId(passengerId, 'passenger');
    this._selectedPassengerIdSignal.set(passengerId);
  }

  private selectStop(stopId: string) {
    this.unselectEntity();
    this.highlightEntityId(stopId, 'stop');
    this._selectedStopIdSignal.set(stopId);
  }

  private unselectVehicle() {
    this.unhighlightEntityId(this._selectedVehicleIdSignal(), 'vehicle');
    this._selectedVehicleIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private unselectPassenger() {
    this.unhighlightEntityId(this._selectedPassengerIdSignal(), 'passenger');
    this._selectedPassengerIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private unselectStop() {
    this.unhighlightEntityId(this._selectedStopIdSignal(), 'stop');
    this._selectedStopIdSignal.set(null);
    this.selectedEntityPolyline.clear();
  }

  private highlightEntityId(
    entityId: string,
    type: 'vehicle' | 'passenger' | 'stop',
  ) {
    let entity;
    switch (type) {
      case 'vehicle':
        entity = this.vehicleEntitiesByVehicleId[entityId];
        break;
      case 'passenger':
        entity = this.passengerEntitiesByPassengerId[entityId];
        break;
      case 'stop':
        entity = this.passengerStopEntitiesByPosition[entityId];
        break;
    }

    if (entity) {
      entity.sprite.parent.filters = [
        new OutlineFilter(1, 0xffffff),
        new OutlineFilter(2, 0xffff00),
      ];
    }
  }

  private unhighlightEntityId(
    entityId: string | null,
    type: 'vehicle' | 'passenger' | 'stop',
  ) {
    if (!entityId) return;
    let entity;
    switch (type) {
      case 'vehicle':
        entity = this.vehicleEntitiesByVehicleId[entityId];
        break;
      case 'passenger':
        entity = this.passengerEntitiesByPassengerId[entityId];
        break;
      case 'stop':
        entity = this.passengerStopEntitiesByPosition[entityId];
        break;
    }
    if (entity) entity.sprite.parent.filters = null;
  }

  selectEntity(entityId: string, type: 'vehicle' | 'passenger' | 'stop') {
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
    this.unselectVehicle();
    this.unselectPassenger();
    this.unselectStop();
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
          this.utils.getRenderer().render(this.container);
        },
        this.container,
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
    return this.passengerEntitiesByPassengerId[id].data.name as string;
  }
}
