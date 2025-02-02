import "leaflet";
import { Popup } from "leaflet";
import * as PIXI from "pixi.js";

declare module "leaflet" {
  interface PixiOverlayOptions extends L.LayerOptions {
    padding: number;
    forceCanvas: boolean;
    doubleBuffering: boolean;
    resolution: number;
    projectionZoom: (map: L.Map) => number;
    destroyInteractionManager: boolean;
    autoPreventDefault: boolean;
    preserveDrawingBuffer: boolean;
    clearBeforeRender: boolean;
    shouldRedrawOnMove: () => boolean;
  }

// Original:
//   type LatLngToLayerPointFn = (latLng: L.LatLng, zoom?: number) => L.Point;
  type LatLngToLayerPointFn = (latLng: L.LatLngExpression, zoom?: number) => L.Point;
  type LayerPointToLatLngFn = (point: L.Point, zoom?: number) => L.LatLng;

  interface PixiOverlayUtils {
    latLngToLayerPoint: LatLngToLayerPointFn;
    layerPointToLatLng: LayerPointToLatLngFn;
    getScale: (zoom?: number) => number; // Removed | undefined
    getRenderer: () => PIXI.IRenderer;
    getContainer: () => PIXI.Container;
    getMap: () => L.Map;
  }

  // Added:
  interface LeafletEvent {
    delta: number;
  }

  type DrawCallbackFn = (
    utils: PixiOverlayUtils,
 //   container: PIXI.Container,
    event: L.LeafletEvent
  ) => void;

  interface LeafletPixiOverlayDefnition
    extends Omit<L.Layer, "onAdd" | "onRemove"> {
    utils: PixiOverlayUtils;
    options: PixiOverlayOptions;
    _container?: HTMLElement;
    _pixiContainer: PIXI.Container;
    _rendererOptions: Partial<PIXI.IRendererOptionsAuto>;
    _doubleBuffering: boolean;
    _map?: L.Map;
    _renderer: PIXI.IRenderer;
    _auxRenderer: PIXI.IRenderer;
    _initialZoom?: number;
    _wgsOrigin?: L.LatLng;
    _wgsInitialShift?: L.Point;
    _mapInitialZoom?: number;
    _drawCallback: (utils: PixiOverlayUtils, event: L.LeafletEvent) => void;
    _setMap: (map: L.Map) => void;
    _setContainerStyle: () => void;
    _addContainer: () => void;
    _setEvents: () => void;
    _onZoom: () => void;
    _onAnimZoom: (event: L.ZoomAnimEvent) => void;
    _onMove: (event: L.LeafletEvent) => void;
    _updateTransform: (
      center: Pick<L.ZoomAnimEvent, "center">,
      zoom: Pick<L.ZoomAnimEvent, "zoom">,
    ) => void;
    _redraw: (offset: number, container: PIXI.Container) => void;
    _update: (event: Partial<L.LeafletEvent>) => void;
    _disableLeafletRounding: () => void;
    _enableLeafletRounding: () => void;
    initialize: (
      drawCallback: DrawCallbackFn,
      pixiContainer: PIXI.Container,
      options?: Partial<PixiOverlayOptions>,
    ) => void;
//    redraw: (data: PIXI.Container) => this;
    redraw: (event: L.LeafletEvent) => this; // Doesn't exactly seem to be a leaflet event, but is not a container either.
    onAdd: (map: L.Map) => void;
    onRemove: () => void;
  }

  function pixiOverlay(
    drawCallback: DrawCallbackFn,
    pixiContainer: PIXI.Container,
    options?: Partial<PixiOverlayOptions>,
  ): LeafletPixiOverlayDefnition;

  // Added this
  function project(latLng: LatLngTuple);
}

// Added this
declare module "pixi.js" {
    interface DisplayObject {
        currentScale: number;
        targetScale: number;
        popup?: Popup;
    }
}