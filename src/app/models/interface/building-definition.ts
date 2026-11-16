import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { IBuilding } from './i-building';
import { BuildingStatus } from '../enum/building-status';
import { Colony } from './colony';
import { PlanetStockpile } from './planet-stockpile';

export interface BuildingDefinition extends IBuilding {
  readonly type: BuildingType;
  readonly code: string;
  readonly costCredits: number;
  readonly costEnergy: number;
  readonly energyGain: number;
  readonly populationGain: number;
  readonly populationCapacity: number;
  readonly production: Exclude<ProducedResource, ProducedResource.Energy> | null;
  readonly productionAmount: number;
  readonly waterUse: number;
  readonly waterSupply: number;
  readonly foodSupply: number;
  energyGainFor(planet: Colony['planet']): number;
  yieldFor(planet: Colony['planet']): number;
  availableYield(
    planet: Colony['planet'],
    deposits: Readonly<Pick<PlanetStockpile, 'minerals' | 'gas'>>,
  ): number;
  complete(planet: Colony['planet'], stocks: PlanetStockpile): void;
  provideLifeSupport(stocks: PlanetStockpile): void;
  demolish(planet: Colony['planet'], stocks: PlanetStockpile, completed: boolean): void;
  produce(
    planet: Colony['planet'],
    stocks: PlanetStockpile,
    deposits: Pick<PlanetStockpile, 'minerals' | 'gas'>,
  ): BuildingStatus;
}
