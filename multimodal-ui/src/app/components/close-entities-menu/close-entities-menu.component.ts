import {
  AfterViewInit,
  Component,
  computed,
  contentChild,
  effect,
  ElementRef,
  signal,
  Signal,
  viewChild,
} from '@angular/core';
import { MatCard, MatCardModule } from '@angular/material/card';
import { AnimationService } from '../../services/animation.service';
import { Point } from 'pixi.js';

@Component({
  selector: 'app-close-entities-menu',
  imports: [MatCardModule],
  templateUrl: './close-entities-menu.component.html',
  styleUrl: './close-entities-menu.component.css',
})
export class CloseEntitiesMenuComponent implements AfterViewInit {
  menu = viewChild.required<ElementRef<HTMLDivElement>>('container');

  private readonly offset = 5;
  private clickPositionSignal: Signal<Point>;

  visibility = signal('hidden');

  top = computed(() => {
    return this.clickPositionSignal().y + this.offset + 'px';
  });

  left = computed(() => {
    return this.clickPositionSignal().x + this.offset + 'px';
  });

  constructor(private readonly animationService: AnimationService) {
    this.clickPositionSignal = animationService.clickPositionSignal;

    effect(() => {
      console.log(this.clickPositionSignal());
      this.visibility.set('visible');
      this.menu()?.nativeElement.focus();
    });
  }

  ngAfterViewInit() {
    this.menu()?.nativeElement.addEventListener('blur', () => {
      this.visibility.set('hidden');
    });
  }
}
