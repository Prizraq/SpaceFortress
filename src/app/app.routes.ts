import { Routes } from '@angular/router';
import { SolarSystemComponent } from './solar-system/components/solar-system/solar-system.component';

export const routes: Routes = [
	{ path: '', pathMatch: 'full', component: SolarSystemComponent },
];
