import { BuildError } from '../models/enum/build-error';
import { BuildingType } from '../models/enum/building-type';
import { BuildingDefinition } from '../models/interface/building-definition';
import { Colony } from '../models/interface/colony';
import * as ColonySimulation from './colony-simulation';
import * as ColonyWorkforce from './colony-workforce';

export function buildProblem(
  colony: Colony | undefined,
  credits: number,
  definition: BuildingDefinition,
): BuildError | null {
  if (!colony) return BuildError.ColonyMissing;
  const type = definition.type;
  if (
    type === BuildingType.Base &&
    colony.buildings.some((building) => building.type === BuildingType.Base)
  )
    return BuildError.BaseExists;
  if (
    type !== BuildingType.Base &&
    !colony.buildings.some((building) => building.type === BuildingType.Base && building.completed)
  )
    return BuildError.BaseRequired;
  if (colony.buildings.length >= ColonySimulation.gridSize(colony.planet.radius) ** 2) return BuildError.MapFull;
  if ((type === BuildingType.Minerals || type === BuildingType.Gas) && colony.deposits[type] <= 0)
    return BuildError.Depleted;
  if (type === BuildingType.Water && colony.planet.resourses.water <= 0)
    return BuildError.WaterUnavailable;
  if (credits < definition.costCredits) return BuildError.Credits;
  if (colony.stocks.minerals < definition.costMinerals) return BuildError.Minerals;
  if (colony.stocks.water < definition.costWater) return BuildError.Water;
  if (colony.stocks.gas < definition.costGas) return BuildError.Gas;
  if (definition.costEnergy > 0 && ColonyWorkforce.colonyWorkforce(colony).energy < definition.costEnergy)
    return BuildError.Energy;
  return null;
}
