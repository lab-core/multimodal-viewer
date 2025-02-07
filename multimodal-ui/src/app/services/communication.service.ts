import { effect, Injectable, Signal, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Socket } from 'ngx-socket-io';
import {
  InformationDialogComponent,
  InformationDialogResult,
} from '../components/information-dialog/information-dialog.component';
import { DialogService } from './dialog.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void | Promise<void>;

@Injectable({
  providedIn: 'root',
})
export class CommunicationService {
  private readonly _isConnectedSignal = signal(false);

  private disconnectedDialogRef: MatDialogRef<
    InformationDialogComponent,
    InformationDialogResult
  > | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly dialogService: DialogService,
  ) {
    effect(() => {
      const isConnected = this.isConnectedSignal();

      if (isConnected) {
        console.log('Connected to server');
      } else {
        console.log('Disconnected from server');
      }

      if (!isConnected) {
        if (this.disconnectedDialogRef === null) {
          this.disconnectedDialogRef = this.dialogService.openInformationDialog(
            {
              title: 'Disconnected',
              message:
                'The connection to the server has been lost. Please verify that the server is running and try again. The application will attempt to reconnect automatically.',
              type: 'error',
              closeButtonOverride: 'Continue Anyway',
            },
          );
        }
      } else {
        if (this.disconnectedDialogRef !== null) {
          this.disconnectedDialogRef.close();
          this.disconnectedDialogRef = null;
        }
      }
    });

    this.onConnect(() => {
      this._isConnectedSignal.set(true);
    });

    this.onDisconnect(() => {
      this._isConnectedSignal.set(false);
    });
  }

  get isConnectedSignal(): Signal<boolean> {
    return this._isConnectedSignal;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.socket.emit(event, ...args);
  }

  on(event: string, listener: Listener): void {
    this.socket.on(event, listener);
  }

  onDisconnect(listener: Listener): void {
    this.socket.on('disconnect', listener);
  }

  onConnect(listener: Listener): void {
    this.socket.on('connect', listener);
  }

  removeAllListeners(event: string): void {
    this.socket.removeAllListeners(event);
  }
}
