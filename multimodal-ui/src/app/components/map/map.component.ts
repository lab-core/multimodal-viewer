/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Component } from '@angular/core';

import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map, tileLayer } from 'leaflet';
import * as PIXI from 'pixi.js';
import { MapService } from '../../services/map.service';

@Component({
  selector: 'app-map',
  imports: [LeafletModule],
  templateUrl: './map.component.html',
  styleUrl: './map.component.css',
})
export class MapComponent {
  options = {
    layers: [
      tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }),
    ],

    // Montreal
    zoom: 12,
    center: latLng(45.523066, -73.652687),
  };

  constructor(private readonly mapService: MapService) {}

  onMapReady(map: Map) {
    this.mapService.map = map;
    this.plugPixiOverlayQuickstart();
  }

  private plugPixiOverlayQuickstart() {
    const map = this.mapService.map;
    (async () => {
      // @ts-ignore
      const markerTexture = await PIXI.Assets.load('/img/marker-icon.png');
      const pixiOverlay = (() => {
        // @ts-ignore
        let frame = null;
        let firstDraw = true;
        // @ts-ignore
        let prevZoom;

        const markerLatLng = [45.523066, -73.652687];
        // @ts-ignore
        const marker = new PIXI.Sprite(markerTexture);
        // @ts-ignore
        marker.popup = L.popup({ className: 'pixi-popup' })
          // @ts-ignore
          .setLatLng(markerLatLng)
          .setContent('<b>Hello world!</b><br>I am a popup.')
          // @ts-ignore
          .openOn(this.mapService.map);

        const polygonLatLngs = [
          [51.509, -0.08],
          [51.503, -0.06],
          [51.51, -0.047],
          [51.509, -0.08],
        ];
        // @ts-ignore
        let projectedPolygon;

        const circleCenter = [45.503066, -73.662687];
        // @ts-ignore
        let projectedCenter;
        let circleRadius = 20;

        // @ts-ignore
        const triangle = new PIXI.Graphics();
        // @ts-ignore
        triangle.popup = L.popup()
          .setLatLng([51.4995, -0.063])
          .setContent('I am a polygon.');
        // @ts-ignore
        const circle = new PIXI.Graphics();
        // @ts-ignore
        circle.popup = L.popup()
          // @ts-ignore
          .setLatLng(circleCenter)
          .setContent('I am a circle.');

        [marker, triangle, circle].forEach((geo) => {
          geo.interactive = true;
          geo.cursor = 'pointer';
        });

        // @ts-ignore
        const pixiContainer = new PIXI.Container();
        pixiContainer.addChild(marker, triangle, circle);

        const doubleBuffering =
          // @ts-ignore
          /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        // @ts-ignore
        return L.pixiOverlay(
          // @ts-ignore
          (utils, event) => {
            // @ts-ignore
            if (frame) {
              cancelAnimationFrame(frame);
              frame = null;
            }
            const zoom = utils.getMap().getZoom();
            const container = utils.getContainer();
            const renderer = utils.getRenderer();
            const project = utils.latLngToLayerPoint;
            const scale = utils.getScale();

            if (firstDraw) {
              // @ts-ignore
              const boundary = new PIXI.EventBoundary(container);
              // @ts-ignore
              utils.getMap().on('click', (e) => {
                // not really nice but much better than before
                // good starting point for improvements
                const interaction = utils.getRenderer().events;
                const pointerEvent = e.originalEvent;
                // @ts-ignore
                const pixiPoint = new PIXI.Point();
                // get global click position in pixiPoint:
                interaction.mapPositionToPoint(
                  pixiPoint,
                  pointerEvent.clientX,
                  pointerEvent.clientY
                );
                // get what is below the click if any:
                const target = boundary.hitTest(pixiPoint.x, pixiPoint.y);
                // @ts-ignore
                if (target && target.popup) {
                  // @ts-ignore
                  target.popup.openOn(map);
                }
              });
              const markerCoords = project(markerLatLng);
              marker.x = markerCoords.x;
              marker.y = markerCoords.y;
              marker.anchor.set(0.5, 1);
              marker.scale.set(1 / scale);
              // @ts-ignore
              marker.currentScale = 1 / scale;

              projectedPolygon = polygonLatLngs.map((coords) =>
                project(coords)
              );

              projectedCenter = project(circleCenter);
              circleRadius = circleRadius / scale;
            }
            // @ts-ignore
            if (firstDraw || prevZoom !== zoom) {
              // @ts-ignore
              marker.currentScale = marker.scale.x;
              // @ts-ignore
              marker.targetScale = 1 / scale;

              triangle.clear();
              triangle.lineStyle(3 / scale, 0x3388ff, 1);
              triangle.beginFill(0x3388ff, 0.2);
              // @ts-ignore
              triangle.x = projectedPolygon[0].x;
              // @ts-ignore
              triangle.y = projectedPolygon[0].y;
              // @ts-ignore
              projectedPolygon.forEach((coords, index) => {
                if (index == 0) triangle.moveTo(0, 0);
                else
                  triangle.lineTo(coords.x - triangle.x, coords.y - triangle.y);
              });
              triangle.endFill();

              circle.clear();
              circle.lineStyle(3 / scale, 0xff0000, 1);
              circle.beginFill(0xff0033, 0.5);
              // @ts-ignore
              circle.x = projectedCenter.x;
              // @ts-ignore
              circle.y = projectedCenter.y;
              circle.drawCircle(0, 0, circleRadius);
              circle.endFill();
            }

            const duration = 100;
            // @ts-ignore
            let start;
            // @ts-ignore
            const animate = (timestamp) => {
              // @ts-ignore
              if (start === null) start = timestamp;
              // @ts-ignore
              const progress = timestamp - start;
              let lambda = progress / duration;
              if (lambda > 1) lambda = 1;
              lambda = lambda * (0.4 + lambda * (2.2 + lambda * -1.6));
              marker.scale.set(
                // @ts-ignore
                marker.currentScale +
                  // @ts-ignore
                  lambda * (marker.targetScale - marker.currentScale)
              );
              renderer.render(container);
              if (progress < duration) {
                frame = requestAnimationFrame(animate);
              }
            };

            // @ts-ignore
            if (!firstDraw && prevZoom !== zoom) {
              start = null;
              frame = requestAnimationFrame(animate);
            }

            if (event.type === 'redraw') {
              const delta = event.delta;
              circle.x += 0.01 * delta;
            }

            firstDraw = false;
            prevZoom = zoom;
            renderer.render(container);
          },
          pixiContainer,
          {
            doubleBuffering: doubleBuffering,
          }
        );
      })();
      pixiOverlay.addTo(this.mapService.map);

      // @ts-ignore
      const ticker = new PIXI.Ticker();
      // @ts-ignore
      ticker.add(function (delta) {
        pixiOverlay.redraw({ type: 'redraw', delta: delta });
      });
      ticker.start();
    })();
  }
}
