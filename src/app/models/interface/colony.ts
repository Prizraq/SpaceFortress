import { IBuilding } from './i-building';
import { Planet } from './planet';

export type BuildingType = 'base' | 'power' | 'water' | 'minerals' | 'gas' | 'housing';
export type ProducedResource = 'minerals' | 'water' | 'gas' | 'energy';
export type BuildingStatus = 'construction' | 'working' | 'depleted' | 'no-energy';
export type BuildError =
  | 'colony-missing'
  | 'base-exists'
  | 'base-required'
  | 'map-full'
  | 'depleted'
  | 'water-unavailable'
  | 'credits'
  | 'minerals'
  | 'water'
  | 'gas'
  | 'energy'
  | 'invalid-tile'
  | 'occupied';

export interface BuildingDefinition extends IBuilding {
  readonly type: BuildingType;
  readonly code: string;
  readonly costCredits: number;
  readonly costEnergy: number;
  readonly energyUse: number;
  readonly populationGain: number;
  readonly production: ProducedResource | null;
  readonly productionAmount: number;
}

export interface PlanetStockpile {
  minerals: number;
  water: number;
  gas: number;
  energy: number;
  population: number;
}

export interface PlacedBuilding {
  readonly id: number;
  readonly type: BuildingType;
  readonly tile: number;
  readonly startedAt: number;
  readonly completesAt: number;
  readonly completed: boolean;
  readonly status: BuildingStatus;
}

export interface Colony {
  readonly planet: Readonly<Omit<Planet, 'resourses'>> & {
    readonly resourses: Readonly<Planet['resourses']>;
  };
  readonly stocks: Readonly<PlanetStockpile>;
  readonly deposits: Readonly<{ minerals: number; gas: number }>;
  readonly buildings: readonly PlacedBuilding[];
}
