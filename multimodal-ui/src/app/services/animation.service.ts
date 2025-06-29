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
  EntityInfo,
  EntityType,
} from '../interfaces/entity.model';
import {
  AnimatedPassenger,
  AnimatedSimulationEnvironment,
  AnimatedStop,
  AnimatedVehicle,
  DataEntity,
  DisplayedPolylines,
  DynamicPassengerAnimationData,
  DynamicVehicleAnimationData,
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

  private readonly _preselectedEntityIdSignal: WritableSignal<DataEntity | null> =
    signal(null);

  private readonly _showPreselectedInTabSignal: WritableSignal<boolean> =
    signal(false);

  private readonly _clickPositionSignal: WritableSignal<PIXI.Point> = signal(
    new PIXI.Point(0, 0),
  );

  private readonly _nearVehiclesSignal: WritableSignal<EntityInfo[]> = signal(
    [],
  );
  private readonly _nearPassengersSignal: WritableSignal<EntityInfo[]> = signal(
    [],
  );
  private readonly _nearStopsSignal: WritableSignal<EntityInfo[]> = signal([]);

  get nearVehiclesSignal(): Signal<EntityInfo[]> {
    return this._nearVehiclesSignal;
  }

  get nearPassengersSignal(): Signal<EntityInfo[]> {
    return this._nearPassengersSignal;
  }

  get nearStopsSignal(): Signal<EntityInfo[]> {
    return this._nearStopsSignal;
  }

  get preselectedEntitySignal(): Signal<DataEntity | null> {
    return this._preselectedEntityIdSignal;
  }

  get showPreselectedInTabSignal(): Signal<boolean> {
    return this._showPreselectedInTabSignal;
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

  private vehicles: Entity<AnimatedVehicle>[] = [];
  private vehicleEntitiesByVehicleId: Record<string, Entity<AnimatedVehicle>> =
    {};
  private passengersEntities: Entity<AnimatedPassenger>[] = [];
  private passengerEntitiesByPassengerId: Record<
    string,
    Entity<AnimatedPassenger>
  > = {};

  private passengerStopEntities: Entity<AnimatedStop>[] = [];
  private passengerStopEntitiesByPosition: Record<
    string,
    Entity<AnimatedStop>
  > = {};

  private container = new PIXI.Container();

  private startTimestamp: number | null = null;
  private endTimestamp: number | null = null;

  private lastScale = 0;

  private utils!: L.PixiOverlayUtils;

  private selectedEntityPolylines: PIXI.Graphics[] = [];

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

  private highlightedLegIndex: number | null = null;

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
      simulationEnvironment.timestamp,
    );

    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
    this.container.removeChildren();
    this.selectedEntityPolylines.forEach((polyline) =>
      this.container.addChild(polyline),
    );
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

    for (const vehicle of Object.values(simulationEnvironment.vehicles)) {
      this.addVehicle(vehicle);
      if (selectedVehicleId !== null && vehicle.id == selectedVehicleId) {
        isSelectedVehicleInEnvironment = true;
        if (this._preselectedEntityIdSignal() == null)
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

    for (const passenger of Object.values(simulationEnvironment.passengers)) {
      this.addPassenger(passenger);
      if (selectedPassengerId !== null && passenger.id == selectedPassengerId) {
        isSelectedPassengerInEnvironment = true;
        if (this._preselectedEntityIdSignal() == null)
          this.highlightEntityId(passenger.id, 'passenger');
      }
    }

    if (selectedPassengerId !== null && !isSelectedPassengerInEnvironment) {
      this.unselectPassenger();
      console.warn(
        'The passenger you selected is not in the environment anymore. It has been deselected.',
      );
    }

    this.passengerStopEntities = [];
    this.passengerStopEntitiesByPosition = {};

    for (const stop of Object.values(simulationEnvironment.stops)) {
      this.addPassengerStop(stop);
    }

    let isSelectedStopInEnvironment = false;
    const selectedStopId = this._selectedStopIdSignal();
    for (const stop of Object.values(simulationEnvironment.stops)) {
      if (selectedStopId !== null && stop.id == selectedStopId) {
        isSelectedStopInEnvironment = true;
        if (this._preselectedEntityIdSignal() == null)
          this.highlightEntityId(stop.id, 'stop');
      }
    }

    if (selectedStopId !== null && !isSelectedStopInEnvironment) {
      this.unselectStop();
      console.warn(
        'The stop you selected is not in the environment anymore. It has been deselected.',
      );
    }

    const preselectedEntity = this._preselectedEntityIdSignal();
    if (preselectedEntity !== null) {
      this.highlightEntityId(
        preselectedEntity.id,
        preselectedEntity.entityType,
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

    // Vehicle background shape
    const graphics = new PIXI.Graphics();
    this.spriteService.drawVehicleBackgroundShape(
      graphics,
      vehicle.mode ?? '',
      vehicle.tags,
    );
    vehicleContainer.addChild(graphics);

    // Vehicle Icon
    const sprite = PIXI.Sprite.from(
      this.spriteService.getVehicleTexture(vehicle.mode ?? '', vehicle.tags),
    );
    vehicleContainer.scale.set(this.spriteService.vehicleSpriteScale);
    sprite.anchor.set(0.5, 0.5); // Center texture on coordinate
    vehicleContainer.addChild(sprite);

    // Vehicle passenger count text
    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    passengerCountText.visible = !this.spriteService.useZoomedOutSprites;
    // Position at the top right corner of the vehicle
    passengerCountText.x = sprite.width / 2;
    passengerCountText.y = -sprite.height / 2;
    vehicleContainer.addChild(passengerCountText);

    const entity: Entity<AnimatedVehicle> = {
      data: vehicle,
      sprites: [sprite],
      texts: [passengerCountText],
      graphics: [graphics],
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
    const passengerContainer = new PIXI.Container();
    passengerContainer.scale.set(this.spriteService.passengerSpriteScale);
    passengerContainer.addChild(sprite);

    const entity: Entity<AnimatedPassenger> = {
      data: passenger,
      sprites: [sprite],
      texts: [],
      graphics: [],
      show: true,
    };

    this.container.addChild(passengerContainer);
    this.passengersEntities.push(entity);

    this.passengerEntitiesByPassengerId[passenger.id] = entity;
  }

  private addPassengerStop(stop: AnimatedStop): void {
    const stopContainer = new PIXI.Container();
    stopContainer.scale.set(this.spriteService.passengerSpriteScale);

    // Background shape
    const graphics = new PIXI.Graphics();
    this.spriteService.drawStopWithPassengerBackgroundShape(
      graphics,
      stop.tags,
      stop.passengerTags,
    );
    stopContainer.addChild(graphics);

    // Sprite
    const sprite = PIXI.Sprite.from(
      // Passenger tags are not available yet, so we pass an empty array.
      this.spriteService.getStopWithPassengerTexture(
        stop.tags,
        stop.passengerTags,
      ),
    );
    sprite.anchor.set(0.5, 0.5);
    stopContainer.addChild(sprite);

    // Background shape (for the stop without passengers)
    const otherGraphics = new PIXI.Graphics();
    this.spriteService.drawEmptyStopBackgroundShape(otherGraphics, stop.tags);
    otherGraphics.visible = false;
    stopContainer.addChild(otherGraphics);

    // Other sprite (for the stop without passengers)
    const otherSprite = PIXI.Sprite.from(
      this.spriteService.getEmptyStopTexture(stop.tags),
    );
    otherSprite.scale.set(0.25);
    otherSprite.anchor.set(0.5, 0.5);
    otherSprite.visible = false;
    stopContainer.addChild(otherSprite);

    // Number of passengers
    const passengerCountText = new PIXI.BitmapText('', this.BITMAP_TEXT_STYLE);
    passengerCountText.visible = !this.spriteService.useZoomedOutSprites;
    // Position at the top right corner of the stop
    passengerCountText.x = sprite.width / 2;
    passengerCountText.y = -sprite.height / 2;
    stopContainer.addChild(passengerCountText);

    // Number of complete passengers
    const completePassengerCountText = new PIXI.BitmapText(
      '',
      this.BITMAP_TEXT_STYLE,
    );
    completePassengerCountText.visible =
      !this.spriteService.useZoomedOutSprites;
    // Position at the bottom right corner of the stop
    completePassengerCountText.x = sprite.width / 2;
    completePassengerCountText.y = sprite.height / 2;
    stopContainer.addChild(completePassengerCountText);

    const entity: Entity<AnimatedStop> = {
      data: {
        ...stop,
      },
      sprites: [sprite, otherSprite],
      texts: [passengerCountText, completePassengerCountText],
      graphics: [graphics, otherGraphics],
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

    this.passengerStopEntitiesByPosition[stop.id] = entity;
  }

  clearAnimations() {
    this.container.removeChildren();
    this.hasCenteredInitially = false;
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
          vehicle.sprites[0].parent.visible &&
          (vehicle.sprites[0].parent.y != 0 ||
            vehicle.sprites[0].parent.x != 0),
      )
      .map((vehicle) => vehicle.sprites[0].parent.y);
    const allVehicleEntitiesX = this.previousVehiclesEntities
      .filter(
        (vehicle) =>
          vehicle.sprites[0].parent.visible &&
          (vehicle.sprites[0].parent.y != 0 ||
            vehicle.sprites[0].parent.x != 0),
      )
      .map((vehicle) => vehicle.sprites[0].parent.x);
    const allPassengerEntitiesY = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprites[0].parent.visible &&
          (passenger.sprites[0].parent.y != 0 ||
            passenger.sprites[0].parent.x != 0),
      )
      .map((passenger) => passenger.sprites[0].parent.y);
    const allPassengerEntitiesX = this.previousPassengerEntities
      .filter(
        (passenger) =>
          passenger.sprites[0].parent.visible &&
          (passenger.sprites[0].parent.y != 0 ||
            passenger.sprites[0].parent.x != 0),
      )
      .map((passenger) => passenger.sprites[0].parent.x);

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
      vehicle.sprites[0].parent.visible =
        vehicle.show &&
        showVehicles && // Are vehicles not filtered
        !filters.has(vehicle.data.mode ?? 'unknown') && // Is mode not filtered
        (!showFavoritesOnly || // Is favorites filter on and is in favorites
          this.favoriteEntitiesService.favVehicleIds().has(vehicle.data.id)) &&
        (shouldShowComplete || // Is complete filter on or is not complete
          vehicle.data.status !== 'complete');

      // TODO Changing this affects the selected entity panel. Use new `number...` field.
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
      passenger.sprites[0].parent.visible =
        passenger.show &&
        this.isPassengerFiltered(
          passenger,
          showPassengers,
          showFavoritesOnly,
          shouldShowComplete,
        );

    // Same for passengers since these stops are only shown when passengers are waiting
    // Filter the passengers of the stop instead of changing the stop container
    // TODO Changing this affects the selected entity panel. Use new `number...` field.
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

    const preselectedEntity = this.preselectedEntitySignal();

    // Always show preselected or selected vehicle
    const selectedVehicleId =
      preselectedEntity?.entityType === 'vehicle'
        ? preselectedEntity.id
        : this.selectedVehicleIdSignal();

    if (selectedVehicleId) {
      const vehicle = this.vehicleEntitiesByVehicleId[selectedVehicleId];
      if (vehicle) vehicle.sprites[0].parent.visible = true;
    }

    // Always show  preselected or selected passenger
    const selectedPassengerId =
      preselectedEntity?.entityType === 'passenger'
        ? preselectedEntity.id
        : this.selectedPassengerIdSignal();

    if (selectedPassengerId) {
      const passenger =
        this.passengerEntitiesByPassengerId[selectedPassengerId];
      if (passenger) passenger.sprites[0].parent.visible = true;
    }
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
        vehicleEntity.sprites[0].parent.x = point.x;
        vehicleEntity.sprites[0].parent.y = point.y;
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
      const preselectedDataEntity = this._preselectedEntityIdSignal();
      if (
        (preselectedDataEntity?.id === vehicle.id ||
          (selectedVehicleId === vehicle.id &&
            preselectedDataEntity === null)) &&
        vehicleEntity.data.currentLineIndex !== null &&
        point !== null
      ) {
        if (this.selectedEntityPolylines.length === 0) {
          this.selectedEntityPolylines.push(new PIXI.Graphics());
          this.selectedEntityPolylines.forEach((polyline) =>
            this.container.addChild(polyline),
          );
        }

        this.frame_pointToFollow = this.utils.layerPointToLatLng(point);
        this.redrawPolyline(
          polylineIndex,
          vehicleEntity.data.currentLineIndex,
          point,
          animationData.displayedPolylines.polylines,
          this.selectedEntityPolylines[0],
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
        if (vehicleEntity !== undefined) {
          const allStops = getAllStops(vehicleEntity.data);
          const stop =
            allStops[(animationData as StaticPassengerAnimationData).stopIndex];
          if (stop !== undefined) {
            const point = this.utils.latLngToLayerPoint([
              stop.position.latitude,
              stop.position.longitude,
            ]);
            passengerEntity.sprites[0].parent.x = point.x;
            passengerEntity.sprites[0].parent.y = point.y;

            const animatedStop = this.passengerStopEntitiesByPosition[stop.id];

            if (animatedStop) {
              animatedStop.data.passengerIds.push(passenger.id);
              if (passenger.status !== 'complete') {
                animatedStop.data.numberOfPassengers +=
                  passenger.numberOfPassengers;
                passenger.tags.forEach((tag) => {
                  if (!animatedStop.data.passengerTags.includes(tag)) {
                    animatedStop.data.passengerTags.push(tag);
                  }
                });
              } else {
                animatedStop.data.numberOfCompletePassengers +=
                  passenger.numberOfPassengers;
              }
            }
          }
        } else {
          // Unknown bug
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
          passengerEntity.sprites[0].parent.x =
            vehicleEntity.sprites[0].parent.x;
          passengerEntity.sprites[0].parent.y =
            vehicleEntity.sprites[0].parent.y;
        }
      } else {
        // Passenger has an unknown error
      }

      const selectedPassengerId = this._selectedPassengerIdSignal();

      if (selectedPassengerId === passenger.id) {
        this.frame_pointToFollow = this.utils.layerPointToLatLng(
          new L.Point(
            passengerEntity.sprites[0].parent.x,
            passengerEntity.sprites[0].parent.y,
          ),
        );
      }
    }
  }

  private resetStopCounters() {
    for (const stopEntity of this.passengerStopEntities) {
      stopEntity.data.passengerIds = [];
      stopEntity.data.vehicleIds = [];
      stopEntity.data.numberOfPassengers = 0;
      stopEntity.data.numberOfCompletePassengers = 0;
      stopEntity.data.passengerTags = [];
      stopEntity.texts[0].text = '';
      stopEntity.texts[1].text = '';
      stopEntity.sprites[0].tint = this.WHITE;
      stopEntity.sprites[0].parent.visible = true;
    }
  }

  private updateStopCounters() {
    for (const stopEntity of this.passengerStopEntities) {
      const allPassengers = stopEntity.data.passengerIds
        .map((passengerId) => this.passengerEntitiesByPassengerId[passengerId])
        .filter((passenger) => passenger !== undefined);

      const passengers = allPassengers.filter(
        (passenger) => passenger.data.status !== 'complete',
      );

      const completePassengers = allPassengers.filter(
        (passenger) => passenger.data.status === 'complete',
      );

      const numberOfDisplayedPassengers = passengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );
      const numberOfPassengers = stopEntity.data.numberOfPassengers;

      const numberOfDisplayedCompletePassengers = completePassengers.reduce(
        (acc, passenger) => acc + passenger.data.numberOfPassengers,
        0,
      );
      const numberOfCompletePassengers =
        stopEntity.data.numberOfCompletePassengers;

      if (
        numberOfDisplayedPassengers + numberOfDisplayedCompletePassengers ===
        0
      ) {
        stopEntity.sprites[0].parent.visible = false;
        continue;
      }

      if (numberOfPassengers === 0) {
        stopEntity.texts[0].text = '';
      } else if (numberOfDisplayedPassengers === numberOfPassengers) {
        stopEntity.texts[0].text = numberOfPassengers.toString();
      } else {
        stopEntity.texts[0].text = `${numberOfDisplayedPassengers} (${numberOfPassengers})`;
      }

      if (numberOfCompletePassengers === 0) {
        stopEntity.texts[1].text = '';
      } else if (
        numberOfDisplayedCompletePassengers === numberOfCompletePassengers
      ) {
        stopEntity.texts[1].text = numberOfCompletePassengers.toString();
      } else {
        stopEntity.texts[1].text = `${numberOfDisplayedCompletePassengers} (${numberOfCompletePassengers})`;
      }

      if (numberOfPassengers === 0) {
        stopEntity.texts[0].tint = 0xffffff;
        stopEntity.texts[1].tint = 0xffffff;
        stopEntity.sprites[0].tint = 0xffffff;
      }

      const interpolate = d3InterpolateRgb(
        this.spriteService.currentColorPreset,
      );

      // Only count not complete passengers for the tint
      const t = Math.min(1, numberOfPassengers / stopEntity.data.capacity);

      const color = d3Color(interpolate(t))?.rgb();

      if (color) {
        const tint = 256 * (color.r * 256 + color.g) + color.b;
        stopEntity.texts[0].tint = tint;
        stopEntity.texts[1].tint = tint;
        stopEntity.sprites[0].tint = tint;
      } else {
        console.warn('Color interpolation failed');
      }
    }

    const showText = !this.spriteService.useZoomedOutSprites;

    const adjustStopDisplay = (stopEntity: Entity<AnimatedStop>) => {
      if (!stopEntity.sprites[0].parent.visible) {
        // Show the empty stop
        stopEntity.sprites[0].parent.visible = true;
        stopEntity.sprites[0].visible = false;
        stopEntity.texts[0].visible = false;
        stopEntity.texts[1].visible = false;
        stopEntity.graphics[0].visible = false;

        stopEntity.sprites[1].visible = true;
        stopEntity.graphics[1].visible = true;
      } else {
        // Show the stop with passengers
        stopEntity.sprites[0].visible = true;
        stopEntity.graphics[0].visible = true;
        stopEntity.texts[0].visible = showText;
        stopEntity.texts[1].visible = showText;

        stopEntity.sprites[1].visible = false;
        stopEntity.graphics[1].visible = false;
      }
    };

    // Always show preselected or selected stop
    const preselectedStop = this.preselectedEntitySignal();
    const selectedStopId =
      preselectedStop?.entityType === 'stop'
        ? preselectedStop.id
        : this.selectedStopIdSignal();

    if (selectedStopId) {
      const stopEntity = this.passengerStopEntitiesByPosition[selectedStopId];
      if (stopEntity) adjustStopDisplay(stopEntity);
    }

    if (this.filters.has('stops')) {
      return;
    }

    for (const stopEntity of this.passengerStopEntities) {
      adjustStopDisplay(stopEntity);
    }
  }

  private followSelectedStop() {
    const selectedStopId = this._selectedStopIdSignal();

    if (selectedStopId === null) return;

    const stopEntity = this.passengerStopEntitiesByPosition[selectedStopId];

    if (stopEntity === undefined) return;

    const point = this.utils.layerPointToLatLng(
      new L.Point(
        stopEntity.sprites[0].parent.x,
        stopEntity.sprites[0].parent.y,
      ),
    );

    this.frame_pointToFollow = point;
  }

  private updateVehiclePassengerCounters() {
    const interpolate = d3InterpolateRgb(this.spriteService.currentColorPreset);

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

      if (numberOfPassengers === 0) vehicleEntity.texts[0].text = '';
      else if (numberOfDisplayedPassengers === numberOfPassengers) {
        vehicleEntity.texts[0].text = numberOfPassengers.toString();
      } else {
        vehicleEntity.texts[0].text = `${numberOfDisplayedPassengers} (${numberOfPassengers})`;
      }

      if (numberOfPassengers === 0) {
        vehicleEntity.texts[0].tint = 0xffffff;
        vehicleEntity.sprites[0].tint = 0xffffff;
        continue;
      }

      const t = Math.min(1, numberOfPassengers / vehicleEntity.data.capacity);
      const color = d3Color(interpolate(t))?.rgb();
      if (!color) continue;

      const tint = 256 * (color.r * 256 + color.g) + color.b;
      vehicleEntity.texts[0].tint = tint;
      vehicleEntity.sprites[0].tint = tint;
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

    vehicleEntity.sprites[0].parent.x = interpolatedPosition.x;
    vehicleEntity.sprites[0].parent.y = interpolatedPosition.y;

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

    const nearVehicles: EntityInfo[] = [];
    const nearPassengers: EntityInfo[] = [];
    const nearStops: EntityInfo[] = [];

    // Distances for all vehicles
    for (const vehicle of this.vehicles) {
      if (!vehicle.sprites[0].parent.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        vehicle.sprites[0].parent.position,
      );
      if (distance <= minVisualDistance)
        nearVehicles.push({ id: vehicle.data.id, name: vehicle.data.name });
    }

    // Distances for all passengers
    for (const passenger of this.passengersEntities) {
      if (!passenger.sprites[0].parent.visible) continue;
      const distance = this.distanceBetweenPoints(
        point,
        passenger.sprites[0].parent.position,
      );
      if (distance <= minVisualDistance)
        nearPassengers.push({
          id: passenger.data.id,
          name: passenger.data.name ?? passenger.data.id,
        });
    }

    // Distances for all stops
    for (const stop of this.passengerStopEntities) {
      if (
        !stop.sprites[0].parent.visible ||
        (!stop.sprites[0].visible && !stop.sprites[1].visible)
      )
        continue;
      const distance = this.distanceBetweenPoints(
        point,
        stop.sprites[0].parent.position,
      );
      if (distance <= minVisualDistance) {
        nearStops.push({ id: stop.data.id, name: stop.data.id });
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

  private redrawPassengerPolyline() {
    const preselectedEntity = this.preselectedEntitySignal();
    const selectedPassengerId =
      preselectedEntity?.entityType === 'passenger'
        ? preselectedEntity.id
        : this.selectedPassengerIdSignal();

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

    // If we have less entity polylines than legs, add the additional missing polylines
    if (this.selectedEntityPolylines.length < legs.length) {
      for (
        let i = 0;
        i < legs.length - this.selectedEntityPolylines.length;
        ++i
      ) {
        const graphics = new PIXI.Graphics();
        this.selectedEntityPolylines.push(new PIXI.Graphics());
        this.container.addChild(graphics);
      }
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

      if (graphics == null) return; // Safe check return when unkown bug

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
        new L.Point(
          passenger.sprites[0].parent.x,
          passenger.sprites[0].parent.y,
        ),
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
    this.spriteService.calculateSpriteScales(utils);
  }

  private onMoveEnd(event: L.LeafletEvent) {
    const scale = this.utils.getScale();
    if (scale != this.lastScale) this.onZoomEnd(event);
    this.lastScale = scale;
  }

  private onZoomEnd(event: L.LeafletEvent) {
    this.spriteService.calculateSpriteScales(this.utils);

    this.updateTextures();
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
    this.redrawPassengerPolyline();
    this.filterEntities();
    this.updateVehiclePassengerCounters();
    this.updateStopCounters();
    this.followSelectedStop();
    this.centerMapToFirstVisibleEntity();
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
    this.vehicles.forEach((vehicle) => {
      if (
        vehicle.sprites[0].parent.visible &&
        vehicle.sprites[0].parent.x !== 0 &&
        vehicle.sprites[0].parent.y !== 0
      ) {
        const x = vehicle.sprites[0].parent.x;
        const y = vehicle.sprites[0].parent.y;
        updateBounds(x, y);
        points.push({
          x,
          y,
        });
      }
    });

    // Get all visible passengers coordinates
    this.passengersEntities.forEach((passenger) => {
      if (passenger.sprites[0].parent.visible) {
        const x = passenger.sprites[0].parent.x;
        const y = passenger.sprites[0].parent.y;
        updateBounds(x, y);
        points.push({
          x,
          y,
        });
      }
    });

    // Get all visible stops coordinates
    this.passengerStopEntities.forEach((stop) => {
      if (stop.sprites[0].parent.visible) {
        const x = stop.sprites[0].parent.x;
        const y = stop.sprites[0].parent.y;
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
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
  }

  private unselectPassenger() {
    this.unhighlightEntityId(this._selectedPassengerIdSignal(), 'passenger');
    this._selectedPassengerIdSignal.set(null);
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
    this.selectedEntityPolylines.forEach((polyline) =>
      polyline.removeFromParent(),
    );
    this.highlightedLegIndex = null;
  }

  private unselectStop() {
    this.unhighlightEntityId(this._selectedStopIdSignal(), 'stop');
    this._selectedStopIdSignal.set(null);
    this.selectedEntityPolylines.forEach((polyline) => polyline.clear());
    this.selectedEntityPolylines.forEach((polyline) =>
      polyline.removeFromParent(),
    );
    this.selectedEntityPolylines = [];
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
        entity = this.passengerStopEntitiesByPosition[entityId];
        break;
    }

    if (entity) {
      entity.sprites[0].parent.filters = [
        new OutlineFilter(1, 0xffffff),
        new OutlineFilter(2, 0xffff00),
      ];
    }
  }

  private unhighlightEntityId(entityId: string | null, type: EntityType) {
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
    if (entity) entity.sprites[0].parent.filters = null;
  }

  preselectEntity(dataEntity: DataEntity | null, showInTab = false) {
    this._preselectedEntityIdSignal.set(dataEntity);
    this._showPreselectedInTabSignal.set(showInTab);
    if (dataEntity)
      this.highlightEntityId(dataEntity.id, dataEntity.entityType);
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
    this._showPreselectedInTabSignal.set(false);
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

  private updateTextures() {
    const showText = !this.spriteService.useZoomedOutSprites;

    this.vehicles.forEach((entity) => {
      entity.sprites[0].parent.scale.set(this.spriteService.vehicleSpriteScale);
      entity.sprites[0].texture = this.spriteService.getVehicleTexture(
        entity.data.mode,
        entity.data.tags,
      );
      entity.texts[0].visible = showText;
      this.spriteService.drawVehicleBackgroundShape(
        entity.graphics[0],
        entity.data.mode,
        entity.data.tags,
      );
    });

    this.passengersEntities.forEach((entity) => {
      entity.sprites[0].parent.scale.set(
        this.spriteService.passengerSpriteScale,
      );
      entity.sprites[0].texture =
        this.spriteService.getCurrentPassengerTexture();
    });

    this.passengerStopEntities.forEach((entity) => {
      entity.sprites[0].parent.scale.set(
        this.spriteService.passengerSpriteScale,
      );
      entity.sprites[0].texture =
        this.spriteService.getStopWithPassengerTexture(
          entity.data.tags,
          entity.data.passengerTags,
        );
      entity.sprites[1].texture = this.spriteService.getEmptyStopTexture(
        entity.data.tags,
      );
      entity.texts[0].visible = showText;
      entity.texts[1].visible = showText;
      this.spriteService.drawStopWithPassengerBackgroundShape(
        entity.graphics[0],
        entity.data.tags,
        entity.data.passengerTags,
      );
      this.spriteService.drawEmptyStopBackgroundShape(
        entity.graphics[1],
        entity.data.tags,
      );
    });
  }
}
