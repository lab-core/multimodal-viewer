import {
  computed,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';

export type UserInterfaceView = 'main-menu' | 'simulation';
@Injectable({
  providedIn: 'root',
})
export class UserInterfaceService {
  private readonly _viewSignal: WritableSignal<UserInterfaceView> =
    signal<UserInterfaceView>('main-menu');

  private readonly _shouldShowMainMenuSignal: WritableSignal<boolean> =
    signal<boolean>(true);
  private readonly _shouldDimMapSignal: WritableSignal<boolean> =
    signal<boolean>(true);

  private readonly _shouldShowSearchBarSignal: WritableSignal<boolean> =
    signal<boolean>(false);
  private readonly _shouldShowInformationPanelSignal: WritableSignal<boolean> =
    signal<boolean>(false);

  // MARK: Signal Getters
  get viewSignal(): Signal<UserInterfaceView> {
    return this._viewSignal;
  }

  get shouldShowMainMenuSignal(): Signal<boolean> {
    return computed(() => {
      return (
        this._viewSignal() === 'main-menu' && this._shouldShowMainMenuSignal()
      );
    });
  }

  get shouldDimMapSignal(): Signal<boolean> {
    return computed(() => {
      return this._viewSignal() === 'main-menu' && this._shouldDimMapSignal();
    });
  }

  get shouldShowSearchBarSignal(): Signal<boolean> {
    return computed(() => {
      return (
        this._viewSignal() === 'simulation' && this._shouldShowSearchBarSignal()
      );
    });
  }

  get shouldShowInformationPanelSignal(): Signal<boolean> {
    return computed(() => {
      return (
        this._viewSignal() === 'simulation' &&
        this._shouldShowInformationPanelSignal()
      );
    });
  }

  // MARK: Signal Setters
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

  showSearchBar() {
    this._shouldShowSearchBarSignal.set(true);
  }

  hideSearchBar() {
    this._shouldShowSearchBarSignal.set(false);
  }

  showInformationPanel() {
    this._shouldShowInformationPanelSignal.set(true);
  }

  hideInformationPanel() {
    this._shouldShowInformationPanelSignal.set(false);
  }

  // MARK: Navigation
  navigateToMainMenu() {
    this._viewSignal.set('main-menu');
    this.showMainMenu();
    this.dimMap();
    this.hideSearchBar();
    this.hideInformationPanel();
  }

  navigateToSimulation() {
    this._viewSignal.set('simulation');
    this.hideMainMenu();
    this.unDimMap();
    this.showSearchBar();
    this.showInformationPanel();
  }
}
