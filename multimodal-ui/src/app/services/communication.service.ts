import { effect, Injectable, Signal, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Socket } from 'ngx-socket-io';
import {
  DisconnectedDialogComponent,
  DisconnectedDialogResult,
} from '../components/disconnected-dialog/disconnected-dialog.component';
import { DialogService } from './dialog.service';

@Injectable()
export class CommunicationService {
  private readonly _isConnectedSignal = signal(false);

  private disconnectedDialogRef: MatDialogRef<
    DisconnectedDialogComponent,
    DisconnectedDialogResult
  > | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly dialogService: DialogService
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
          this.disconnectedDialogRef =
            this.dialogService.openDisconnectedDialog();
        }
      } else {
        if (this.disconnectedDialogRef !== null) {
          this.disconnectedDialogRef.close();
          this.disconnectedDialogRef = null;
        }
      }
    });

    this.socket.on('connect', () => {
      this._isConnectedSignal.set(true);
    });

    this.socket.on('disconnect', () => {
      this._isConnectedSignal.set(false);
    });
  }

  get isConnectedSignal(): Signal<boolean> {
    return this._isConnectedSignal;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string, ...args: any[]): void {
    this.socket.emit('client/' + event, ...args);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): void {
    this.socket.on('client/' + event, listener);
  }
}
