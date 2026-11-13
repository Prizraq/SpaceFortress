import { BuildError, BuildingDefinition, Colony } from '../models/interface/colony';
import { gridSize } from './colony-simulation';

export function buildProblem(
  colony: Colony | undefined,
  credits: number,
  definition: BuildingDefinition,
): BuildError | null {
  if (!colony) return 'colony-missing';
  const type = definition.type;
  if (type === 'base' && colony.buildings.some((building) => building.type === 'base'))
    return 'base-exists';
  if (
    type !== 'base' &&
    !colony.buildings.some((building) => building.type === 'base' && building.completed)
  )
    return 'base-required';
  if (colony.buildings.length >= gridSize(colony.planet.radius) ** 2) return 'map-full';
  if ((type === 'minerals' || type === 'gas') && colony.deposits[type] <= 0) return 'depleted';
  if (type === 'water' && colony.planet.resourses.water <= 0) return 'water-unavailable';
  if (credits < definition.costCredits) return 'credits';
  if (colony.stocks.minerals < definition.costMinerals) return 'minerals';
  if (colony.stocks.water < definition.costWater) return 'water';
  if (colony.stocks.gas < definition.costGas) return 'gas';
  if (colony.stocks.energy < definition.costEnergy) return 'energy';
  return null;
}
