import { BuildingStatus } from '../enum/building-status';
import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { BuildingDefinition } from '../interface/building-definition';
import { Colony } from '../interface/colony';
import { PlanetStockpile } from '../interface/planet-stockpile';

export abstract class Building implements BuildingDefinition {
  abstract readonly type: BuildingType;
  abstract readonly code: string;
  abstract readonly name: string;
  abstract readonly overview: string;
  abstract readonly costCredits: number;
  abstract readonly costMinerals: number;
  abstract readonly buildTime: number;
  readonly costWater: number = 0;
  readonly costGas: number = 0;
  readonly costEnergy: number = 0;
  readonly maintenancePerMinute: number = 0;
  readonly energyGain: number = 0;
  readonly populationGain: number = 0;
  readonly populationCapacity: number = 0;
  readonly production: Exclude<ProducedResource, ProducedResource.Energy> | null = null;
  readonly productionAmount: number = 0;
  readonly waterUse: number = 0;
  readonly waterSupply: number = 0;
  readonly foodSupply: number = 0;
  readonly workersRequired: number = 0;

  energyGainFor(_planet: Colony['planet']): number {
    return this.energyGain;
  }

  yieldFor(planet: Colony['planet']): number {
    if (!this.production) return 0;
    if (this.production === ProducedResource.Food) return this.productionAmount;
    return Math.ceil((planet.resourses[this.production] / 100) * this.productionAmount);
  }

  availableYield(
    planet: Colony['planet'],
    deposits: Readonly<Pick<PlanetStockpile, 'minerals' | 'gas'>>,
  ): number {
    const resource = this.production;
    const amount = this.yieldFor(planet);
    return resource === ProducedResource.Minerals || resource === ProducedResource.Gas
      ? Math.min(amount, deposits[resource])
      : amount;
  }

  complete(stocks: PlanetStockpile): void {
    stocks.populationCapacity += this.populationCapacity;
    stocks.population = Math.min(
      stocks.populationCapacity,
      stocks.population + this.populationGain,
    );
  }

  provideLifeSupport(stocks: PlanetStockpile): void {
    stocks.water = Math.round((stocks.water + this.waterSupply) * 10) / 10;
    stocks.food = Math.round((stocks.food + this.foodSupply) * 10) / 10;
  }

  demolish(stocks: PlanetStockpile, completed: boolean): void {
    if (completed) stocks.populationCapacity -= this.populationCapacity;
  }

  produce(
    planet: Colony['planet'],
    stocks: PlanetStockpile,
    deposits: Pick<PlanetStockpile, 'minerals' | 'gas'>,
    efficiency = 1,
  ): BuildingStatus {
    const resource = this.production;
    if (!resource) return BuildingStatus.Working;
    const extracted = Math.min(
      this.availableYield(planet, deposits),
      this.yieldFor(planet) * efficiency,
    );
    if (efficiency === 0) return BuildingStatus.NoWorkers;
    if (extracted === 0) return BuildingStatus.Depleted;
    if (stocks.water < this.waterUse) return BuildingStatus.NoWater;
    stocks.water = Math.round((stocks.water - this.waterUse) * 10) / 10;
    stocks[resource] = Math.round((stocks[resource] + extracted) * 10) / 10;
    stocks.water = Math.round(stocks.water * 10) / 10;
    stocks.food = Math.round(stocks.food * 10) / 10;
    if (resource === ProducedResource.Minerals || resource === ProducedResource.Gas)
      deposits[resource] = Math.round((deposits[resource] - extracted) * 10) / 10;
    return BuildingStatus.Working;
  }
}
