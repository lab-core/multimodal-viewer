import {
  Component,
  computed,
  effect,
  ElementRef,
  signal,
  viewChild,
} from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { EntityMetadata } from '../../interfaces/entity.model';
import { AnimationService } from '../../services/animation.service';
import { EntityNameComponent } from '../entity-name/entity-name.component';

@Component({
  selector: 'app-close-entities-menu',
  imports: [MatCardModule, MatChipsModule, MatIconModule, EntityNameComponent],
  templateUrl: './close-entities-menu.component.html',
  styleUrl: './close-entities-menu.component.css',
})
export class CloseEntitiesMenuComponent {
  private readonly offset = 30;
  private readonly maxHeightPadding = 150;
  private readonly width = 250;

  container = viewChild.required<ElementRef<HTMLDivElement>>('container');
  cardContent = viewChild.required<ElementRef<HTMLDivElement>>('cardContent');

  show = signal(false);

  top = computed(() => {
    const clickPosition = this.animationService.clickPositionSignal();
    if (clickPosition === null) {
      return '';
    }

    const y = clickPosition.y;

    if (y < window.innerHeight / 2) {
      return y + 'px';
    }
    return '';
  });

  bottom = computed(() => {
    const clickPosition = this.animationService.clickPositionSignal();

    if (clickPosition === null) {
      return '';
    }

    const y = clickPosition.y;

    if (y >= window.innerHeight / 2) {
      return window.innerHeight - y + 'px';
    }
    return '';
  });

  left = computed(() => {
    const clickPosition = this.animationService.clickPositionSignal();
    if (clickPosition === null) {
      return '';
    }

    const x = clickPosition.x;

    if (x + 2 * this.offset + this.width > window.innerWidth) {
      return x - this.offset - this.width + 'px';
    }

    return x + this.offset + 'px';
  });

  maxHeight = computed(() => {
    const clickPosition = this.animationService.clickPositionSignal();

    if (clickPosition === null) {
      return '';
    }

    const y = clickPosition.y;

    if (y < window.innerHeight / 2) {
      return window.innerHeight - y - this.maxHeightPadding + 'px';
    }
    return y - this.maxHeightPadding + 'px';
  });

  constructor(private readonly animationService: AnimationService) {
    // Show menu when click position triggered
    effect(() => {
      const position = this.animationService.clickPositionSignal();
      if (position === null) {
        this.show.set(false);
      } else {
        this.show.set(true);
        this.cardContent()?.nativeElement.scroll(0, 0);
        this.container()?.nativeElement.focus();
      }
    });
  }

  get closeEntitiesSignal() {
    return this.animationService.closeEntitiesSignal;
  }

  unpreselectEntity() {
    this.animationService.unpreselectEntity();
  }

  preselectEntity(entity: EntityMetadata) {
    this.animationService.preselectEntity(entity, true);
  }

  selectEntity(entity: EntityMetadata) {
    this.show.set(false);
    this.animationService.clickHandled();
    this.animationService.selectEntity(entity);
  }

  onBlur() {
    this.unpreselectEntity();
    this.show.set(false);
  }
}
