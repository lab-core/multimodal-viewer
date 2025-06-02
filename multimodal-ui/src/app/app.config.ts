import { provideHttpClient } from '@angular/common/http';
import {
  ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';

import { SocketIoConfig, SocketIoModule } from 'ngx-socket-io';
import { environment } from '../environments/environment';
import { routes } from './app.routes';

const socketIoConfiguration: SocketIoConfig = {
  url: environment.socketUrl,
  options: { auth: { type: 'client' } },
};

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(SocketIoModule.forRoot(socketIoConfiguration)),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
  ],
};
