import { Injectable, Signal, signal, WritableSignal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

export type UserInterfaceView = 'main-menu' | 'start-simulation';
@Injectable({
  providedIn: 'root',
})
export class UserInterfaceService {
  private readonly _shouldShowMainMenuSignal: WritableSignal<boolean> =
    signal<boolean>(true);
  private readonly _shouldDimMapSignal: WritableSignal<boolean> =
    signal<boolean>(true);

  constructor(private readonly matDialog: MatDialog) {}

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return this._shouldShowMainMenuSignal;
  }

  get shouldDimMapSignal(): Signal<boolean> {
    return this._shouldDimMapSignal;
  }

  showMainMenu() {
    this._shouldShowMainMenuSignal.set(true);
  }

  hideMainMenu() {
    this._shouldShowMainMenuSignal.set(false);
  }

  dimMap() {
    this._shouldDimMapSignal.set(true);
  }

  unDimMap() {
    this._shouldDimMapSignal.set(false);
  }
}
