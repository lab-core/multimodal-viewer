import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { EntityMetadata } from '../interfaces/entity.model';
import { SimulationService } from './simulation.service';

interface FavoritesSaveData {
  version: number;
  favoriteEntities: EntityMetadata[];
}

@Injectable({
  providedIn: 'root',
})
export class FavoriteEntitiesService {
  // Arrays to have them sorted
  // Sets to quickly search

  readonly VERSION = 2;
  private readonly KEY_FAVORITES_PREFIX = 'multimodal.favorites.';

  private _favoriteEntitiesSignal: WritableSignal<EntityMetadata[]> = signal(
    [],
  );

  private _simulationFavKey: Signal<string | null> = computed(() => {
    const simulation = this.simulationService.activeSimulationSignal();
    if (!simulation) return null;
    return `${this.KEY_FAVORITES_PREFIX}${simulation.id}`;
  });

  get favoriteEntitiesSignal(): Signal<EntityMetadata[]> {
    return this._favoriteEntitiesSignal;
  }

  constructor(private simulationService: SimulationService) {
    effect(() => {
      this.loadFavoritesFromLocalStorage();
    });

    effect(() => {
      this.saveFavoritesToLocalStorage();
    });
  }

  toggleFavoriteEntity(entity: EntityMetadata): void {
    this._favoriteEntitiesSignal.update((favorites) => {
      // If is in the list
      if (
        favorites.find(
          (favorite) =>
            favorite.id === entity.id &&
            favorite.entityType === entity.entityType,
        )
      ) {
        // Remove from list
        favorites = favorites.filter(
          (favorite) =>
            favorite.id !== entity.id ||
            favorite.entityType !== entity.entityType,
        );
      } else {
        favorites.push(entity);
      }
      return [...this.sortFavorites(favorites)];
    });
  }

  isFavoriteEntity(entity: EntityMetadata): boolean {
    return this._favoriteEntitiesSignal().some(
      (favorite) =>
        favorite.id === entity.id && favorite.entityType === entity.entityType,
    );
  }

  private loadFavoritesFromLocalStorage() {
    const simulationFavoritesKey = this._simulationFavKey();
    if (simulationFavoritesKey === null) {
      return;
    }

    const favoritesSaveDataJson = localStorage.getItem(simulationFavoritesKey);
    if (!favoritesSaveDataJson) return;

    const favoritesSaveData = JSON.parse(
      favoritesSaveDataJson,
    ) as FavoritesSaveData;

    if (
      !favoritesSaveData.version ||
      favoritesSaveData.version !== this.VERSION
    )
      return;

    if (!Array.isArray(favoritesSaveData.favoriteEntities)) return;

    this._favoriteEntitiesSignal.set(
      this.sortFavorites(favoritesSaveData.favoriteEntities),
    );
  }

  private saveFavoritesToLocalStorage() {
    const simulationFavKey = this._simulationFavKey();
    if (simulationFavKey === null) return;

    const favoritesSaveData: FavoritesSaveData = {
      version: this.VERSION,
      favoriteEntities: this._favoriteEntitiesSignal(),
    };

    localStorage.setItem(simulationFavKey, JSON.stringify(favoritesSaveData));
  }

  private sortFavorites(favorites: EntityMetadata[]): EntityMetadata[] {
    return favorites.sort((a, b) => {
      if (a.entityType !== b.entityType) {
        return a.entityType.localeCompare(b.entityType);
      }
      return a.name.localeCompare(b.name);
    });
  }
}
