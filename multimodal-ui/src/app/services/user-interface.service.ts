import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class UserInterfaceService {
  private readonly _shouldShowMainMenuSignal: WritableSignal<boolean> =
    signal(true);

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return this._shouldShowMainMenuSignal;
  }

  showMainMenu() {
    this._shouldShowMainMenuSignal.set(true);
  }

  hideMainMenu() {
    this._shouldShowMainMenuSignal.set(false);
  }
}
