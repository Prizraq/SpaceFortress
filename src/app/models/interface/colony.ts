import { PlacedBuilding } from './placed-building';
import { Planet } from './planet';
import { PlanetStockpile } from './planet-stockpile';

export interface Colony {
  readonly planet: Readonly<Omit<Planet, 'resourses'>> & {
    readonly resourses: Readonly<Planet['resourses']>;
  };
  readonly stocks: Readonly<PlanetStockpile>;
  readonly deposits: Readonly<{ minerals: number; gas: number }>;
  readonly buildings: readonly PlacedBuilding[];
}
