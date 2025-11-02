import {
  effect,
  inject,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { ParseError, parseQuery } from '../interfaces/parse-query.model';
import { Query } from '../interfaces/query.model';
import { AnimationService } from './animation.service';

@Injectable()
export class VisualizationFilterService {
  private readonly animationService = inject(AnimationService);

  private readonly _error: WritableSignal<string | null> = signal(null);

  private readonly _query: WritableSignal<Query | null> = signal(null);

  readonly error: Signal<string | null> = this._error.asReadonly();

  constructor() {
    effect(() => {
      this.effectOnFilterChanged();
    });
  }

  setFilterQuery(queryString: string | null) {
    try {
      this._query.set(queryString ? parseQuery(queryString) : null);
      this._error.set(null);
    } catch (e) {
      console.error(e);
      if (e instanceof ParseError) {
        this._error.set(e.message);
      } else {
        this._error.set('Unknown error');
      }
    }
  }

  private effectOnFilterChanged() {
    this.animationService.setFilters(this._query());
  }
}
