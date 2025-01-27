// @ts-nocheck
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { latLng, Map, tileLayer } from 'leaflet';
import { MapService } from './services/map.service';

import * as PIXI from 'pixi.js';
// import * as L from 'leaflet';
import 'leaflet-pixi-overlay';
import { CommunicationService } from './services/communication.service';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    LeafletModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
  ],
  providers: [CommunicationService],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  mapService: MapService = inject(MapService);

  title = 'multimodal-ui';

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

  constructor(private readonly communicationService: CommunicationService) {
    this.communicationService.on('simulationEnded', (name) => {
      console.log(`Simulation ended: ${name}`);
    });
  }

  simulate() {
    this.communicationService.emit('startSimulation', 'test');
  }

  onMapReady(map: Map) {
    this.mapService.map = map;
    this.plugPixiOverlayQuickstart();
  }

  printLongLatZoom() {
    console.log(this.mapService.map?.getCenter());
    console.log(this.mapService.map?.getZoom());
  }

  // @ts-nocheck
  plugPixiOverlayQuickstart() {
    const map = this.mapService.map;
    (async () => {
      const markerTexture = await PIXI.Assets.load('/img/marker-icon.png');
      const pixiOverlay = (() => {
        let frame = null;
        let firstDraw = true;
        let prevZoom;

        const markerLatLng = [45.523066, -73.652687];
        const marker = new PIXI.Sprite(markerTexture);
        marker.popup = L.popup({ className: 'pixi-popup' })
          .setLatLng(markerLatLng)
          .setContent('<b>Hello world!</b><br>I am a popup.')
          .openOn(this.mapService.map);

        const polygonLatLngs = [
          [51.509, -0.08],
          [51.503, -0.06],
          [51.51, -0.047],
          [51.509, -0.08],
        ];
        let projectedPolygon;

        const circleCenter = [45.503066, -73.662687];
        let projectedCenter;
        let circleRadius = 20;

        const triangle = new PIXI.Graphics();
        triangle.popup = L.popup()
          .setLatLng([51.4995, -0.063])
          .setContent('I am a polygon.');
        const circle = new PIXI.Graphics();
        circle.popup = L.popup()
          .setLatLng(circleCenter)
          .setContent('I am a circle.');

        [marker, triangle, circle].forEach((geo) => {
          geo.interactive = true;
          geo.cursor = 'pointer';
        });

        const pixiContainer = new PIXI.Container();
        pixiContainer.addChild(marker, triangle, circle);

        const doubleBuffering =
          /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        return L.pixiOverlay(
          (utils, event) => {
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
              const boundary = new PIXI.EventBoundary(container);
              utils.getMap().on('click', (e) => {
                // not really nice but much better than before
                // good starting point for improvements
                const interaction = utils.getRenderer().events;
                const pointerEvent = e.originalEvent;
                const pixiPoint = new PIXI.Point();
                // get global click position in pixiPoint:
                interaction.mapPositionToPoint(
                  pixiPoint,
                  pointerEvent.clientX,
                  pointerEvent.clientY
                );
                // get what is below the click if any:
                const target = boundary.hitTest(pixiPoint.x, pixiPoint.y);
                if (target && target.popup) {
                  target.popup.openOn(map);
                }
              });
              const markerCoords = project(markerLatLng);
              marker.x = markerCoords.x;
              marker.y = markerCoords.y;
              marker.anchor.set(0.5, 1);
              marker.scale.set(1 / scale);
              marker.currentScale = 1 / scale;

              projectedPolygon = polygonLatLngs.map((coords) =>
                project(coords)
              );

              projectedCenter = project(circleCenter);
              circleRadius = circleRadius / scale;
            }
            if (firstDraw || prevZoom !== zoom) {
              marker.currentScale = marker.scale.x;
              marker.targetScale = 1 / scale;

              triangle.clear();
              triangle.lineStyle(3 / scale, 0x3388ff, 1);
              triangle.beginFill(0x3388ff, 0.2);
              triangle.x = projectedPolygon[0].x;
              triangle.y = projectedPolygon[0].y;
              projectedPolygon.forEach((coords, index) => {
                if (index == 0) triangle.moveTo(0, 0);
                else
                  triangle.lineTo(coords.x - triangle.x, coords.y - triangle.y);
              });
              triangle.endFill();

              circle.clear();
              circle.lineStyle(3 / scale, 0xff0000, 1);
              circle.beginFill(0xff0033, 0.5);
              circle.x = projectedCenter.x;
              circle.y = projectedCenter.y;
              circle.drawCircle(0, 0, circleRadius);
              circle.endFill();
            }

            const duration = 100;
            let start;
            const animate = (timestamp) => {
              if (start === null) start = timestamp;
              const progress = timestamp - start;
              let lambda = progress / duration;
              if (lambda > 1) lambda = 1;
              lambda = lambda * (0.4 + lambda * (2.2 + lambda * -1.6));
              marker.scale.set(
                marker.currentScale +
                  lambda * (marker.targetScale - marker.currentScale)
              );
              renderer.render(container);
              if (progress < duration) {
                frame = requestAnimationFrame(animate);
              }
            };

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

      const ticker = new PIXI.Ticker();
      ticker.add(function (delta) {
        pixiOverlay.redraw({ type: 'redraw', delta: delta });
      });
      ticker.start();
    })();
  }
}
