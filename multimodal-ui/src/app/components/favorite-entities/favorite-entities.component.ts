import { Component, Signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EntityMetadata } from '../../interfaces/entity.model';
import { AnimationService } from '../../services/animation.service';
import { FavoriteEntitiesService } from '../../services/favorite-entities.service';
import { VisualizationService } from '../../services/visualization.service';
import { EntityNameComponent } from '../entity-name/entity-name.component';

@Component({
  selector: 'app-favorite-entities',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    EntityNameComponent,
  ],
  templateUrl: './favorite-entities.component.html',
  styleUrl: './favorite-entities.component.css',
})
export class FavoriteEntitiesComponent {
  constructor(
    private readonly favoriteEntitiesService: FavoriteEntitiesService,
    private readonly visualizationService: VisualizationService,
    private readonly animationService: AnimationService,
  ) {}

  get favoriteEntitiesSignal(): Signal<EntityMetadata[]> {
    return this.favoriteEntitiesService.favoriteEntitiesSignal;
  }

  unpreselectEntity() {
    this.animationService.unpreselectEntity();
  }

  preselectEntity(entity: EntityMetadata) {
    this.animationService.preselectEntity(entity, true);
  }

  selectEntity(entity: EntityMetadata): void {
    this.animationService.selectEntity(entity);
  }

  toggleFavoriteEntity(entity: EntityMetadata): void {
    this.favoriteEntitiesService.toggleFavoriteEntity(entity);
  }

  isEntityInEnvironment(entity: EntityMetadata): boolean {
    const environment = this.visualizationService.environmentSignal();
    if (!environment) return false;

    switch (entity.entityType) {
      case 'vehicle':
        return environment.vehicles[entity.id] !== undefined;
      case 'passenger':
        return environment.passengers[entity.id] !== undefined;
      case 'stop':
        return environment.stops[entity.id] !== undefined;
      default:
        return false;
    }
  }
}
