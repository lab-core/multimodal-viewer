import {
  Component,
  computed,
  effect,
  ElementRef,
  signal,
  Signal,
  viewChild,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Point } from 'pixi.js';
import { AnimationService } from '../../services/animation.service';
import { EntityInfo } from '../../interfaces/entity.model';

@Component({
  selector: 'app-close-entities-menu',
  imports: [MatCardModule, MatChipsModule, MatIconModule],
  templateUrl: './close-entities-menu.component.html',
  styleUrl: './close-entities-menu.component.css',
})
export class CloseEntitiesMenuComponent {
  private readonly offset = 30;
  private readonly maxHeightPadding = 150;

  private clickPositionSignal: Signal<Point>;
  private selectedEntity = false; // Avoid triggering mouseout event if user selected an entity

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  cardContent = viewChild.required<ElementRef<HTMLDivElement>>('cardContent');

  nearVehiclesSignal: Signal<EntityInfo[]>;
  nearPassengersSignal: Signal<EntityInfo[]>;
  nearStopsSignal: Signal<EntityInfo[]>;

  show = signal(false);

  top = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y < window.innerHeight / 2) {
      return y + 'px';
    } else return '';
  });

  bottom = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y >= window.innerHeight / 2) {
      return window.innerHeight - y + 'px';
    } else return '';
  });

  left = computed(() => {
    return this.clickPositionSignal().x + this.offset + 'px';
  });

  maxHeight = computed(() => {
    const y = this.clickPositionSignal().y;

    if (y < window.innerHeight / 2)
      return window.innerHeight - y - this.maxHeightPadding + 'px';
    else return y - this.maxHeightPadding + 'px';
  });

  constructor(private readonly animationService: AnimationService) {
    this.clickPositionSignal = animationService.clickPositionSignal;
    this.nearVehiclesSignal = animationService.nearVehiclesSignal;
    this.nearPassengersSignal = animationService.nearPassengersSignal;
    this.nearStopsSignal = animationService.nearStopsSignal;

    // Show menu when click position triggered
    effect(() => {
      const position = this.clickPositionSignal();
      if (position.x === 0 && position.y === 0) {
        this.show.set(false);
      } else {
        this.show.set(true);
        this.cardContent()?.nativeElement.scroll(0, 0);
        this.container()?.nativeElement.focus();
      }
      this.selectedEntity = false;
    });
  }

  onClickVehicle(id: string) {
    this.selectedEntity = true;
    this.show.set(false);
    this.animationService.selectEntity(id, 'vehicle');
  }

  onClickPassenger(id: string) {
    this.selectedEntity = true;
    this.show.set(false);
    this.animationService.selectEntity(id, 'passenger');
  }

  onClickStop(id: string) {
    this.selectedEntity = true;
    this.show.set(false);
    this.animationService.selectEntity(id, 'stop');
  }

  selectVehicle(id: string) {
    this.animationService.selectEntity(id, 'vehicle');
  }

  selectPassenger(id: string) {
    this.animationService.selectEntity(id, 'passenger');
  }

  selectStop(id: string) {
    this.animationService.selectEntity(id, 'stop');
  }

  unselectEntity() {
    if (this.selectedEntity) return;
    this.animationService.unselectEntity();
  }

  onBlur() {
    this.show.set(false);
  }

  getPassengerName(id: string): string {
    return this.animationService.findPassengerName(id) || id;
  }
}
