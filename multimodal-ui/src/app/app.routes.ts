import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { VisualizerComponent } from './components/visualizer/visualizer.component';
import { clearMapGuard } from './guards/clear-map.guard';
import { loadActiveSimulationGuard } from './guards/load-active-simulation.guard';
import { unloadActiveSimulationGuard } from './guards/unload-active-simulation.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  {
    path: 'visualize/:simulationId',
    component: VisualizerComponent,
    canActivate: [loadActiveSimulationGuard],
    canDeactivate: [unloadActiveSimulationGuard, clearMapGuard],
  },
  { path: '**', redirectTo: 'home' },
];
