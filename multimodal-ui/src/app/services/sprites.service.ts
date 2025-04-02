import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { CustomSprite } from '../interfaces/entity.model';

@Injectable({
  providedIn: 'root',
})
export class SpritesService {
  private _customSprites: WritableSignal<CustomSprite[]> = signal([]);

  get customSprites(): Signal<CustomSprite[]> {
    return this._customSprites;
  }

  add() {
    this._customSprites.update((customSprites) => {
      return [...customSprites, { mode: '', url: '/images/sample-bus.png' }];
    });
  }

  remove(index: number) {
    if (index >= this._customSprites().length) return;
    this._customSprites.update((customSprites) => {
      return customSprites.splice(index, 1);
    });
  }

  set(index: number, mode: string, url: string | ArrayBuffer) {
    if (index >= this._customSprites().length) return;
    this._customSprites.update((customSprites) => {
      customSprites[index] = {
        mode,
        url,
      };
      return [...customSprites];
    });
  }
}
