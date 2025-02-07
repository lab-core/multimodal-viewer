import {
  computed,
  effect,
  Injectable,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Socket } from 'ngx-socket-io';
import {
  InformationDialogComponent,
  InformationDialogResult,
} from '../components/information-dialog/information-dialog.component';
import { DialogService } from './dialog.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SocketEventArguments = any[];
export type SocketEventListener = (
  ...args: SocketEventArguments
) => void | Promise<void>;

export type CommunicationStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class CommunicationService {
  private readonly _communicationStatusSignal: WritableSignal<
    'connected' | 'disconnected' | 'connecting'
  > = signal('connecting');

  private disconnectedDialogRef: MatDialogRef<
    InformationDialogComponent,
    InformationDialogResult
  > | null = null;

  constructor(
    private readonly socket: Socket,
    private readonly dialogService: DialogService,
  ) {
    effect(() => {
      const communicationStatus = this._communicationStatusSignal();

      switch (communicationStatus) {
        case 'connected':
          console.log('Connected to server');
          break;
        case 'disconnected':
          console.log('Disconnected from server');
          break;
        case 'connecting':
          console.log('Connecting to server');
          break;
      }

      if (communicationStatus === 'disconnected') {
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
      this._communicationStatusSignal.set('connected');
    });

    this.onDisconnect(() => {
      this._communicationStatusSignal.set('disconnected');
    });

    // If the connection is not established after 1 second, set the status to disconnected
    setTimeout(() => {
      this._communicationStatusSignal.update((status) => {
        if (status === 'connecting') {
          return 'disconnected';
        }
        return status;
      });
    }, 1000);
  }

  get isConnectedSignal(): Signal<boolean> {
    return computed(() => this._communicationStatusSignal() === 'connected');
  }

  get communicationStatusSignal(): Signal<CommunicationStatus> {
    return this._communicationStatusSignal;
  }

  emit(event: string, ...args: SocketEventArguments): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.socket.emit(event, ...args);
  }

  on(event: string, listener: SocketEventListener): void {
    this.socket.on(event, listener);
  }

  onDisconnect(listener: SocketEventListener): void {
    this.socket.on('disconnect', listener);
  }

  onConnect(listener: SocketEventListener): void {
    this.socket.on('connect', listener);
  }

  removeAllListeners(event: string): void {
    this.socket.removeAllListeners(event);
  }
}
