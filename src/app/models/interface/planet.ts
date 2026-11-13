import { PlanetResourses } from './planet-resourses';

export interface Planet {
  readonly id: string;
  name: string;
  radius: number;
  distanceFromSun: number;
  orbitalPeriod: number;
  mass: number;
  gravity: number;
  athmosphere: boolean;
  resourses: PlanetResourses;
}
