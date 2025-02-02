import { Injectable, Signal, signal, WritableSignal } from '@angular/core';

export type UserInterfaceView = 'main-menu' | 'simulation';
@Injectable({
  providedIn: 'root',
})
export class UserInterfaceService {
  private readonly _shouldShowInformationPanelSignal: WritableSignal<boolean> =
    signal<boolean>(false);

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return this._shouldShowInformationPanelSignal;
  }

  showInformationPanel() {
    this._shouldShowInformationPanelSignal.set(true);
  }

  hideInformationPanel() {
    this._shouldShowInformationPanelSignal.set(false);
  }
}
