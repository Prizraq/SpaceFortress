import { BuildingType } from '../models/enum/building-type';
import { DemolitionError } from '../models/enum/demolition-error';
import { Colony } from '../models/interface/colony';
import * as BuildingCatalogue from './building-catalogue';
import * as ColonyWorkforce from './colony-workforce';

export function demolitionProblem(
  colony: Colony | undefined,
  buildingId: number,
): DemolitionError | null {
  if (!colony) return DemolitionError.ColonyMissing;
  const building = colony.buildings.find((building) => building.id === buildingId);
  if (!building) return DemolitionError.BuildingMissing;
  if (building.type === BuildingType.Base) return DemolitionError.BaseProtected;
  const definition = BuildingCatalogue.BUILDINGS_BY_TYPE[building.type];
  if (
    building.completed &&
    definition.energyGainFor(colony.planet) > 0 &&
    ColonyWorkforce.colonyWorkforce({
      ...colony,
      buildings: colony.buildings.filter((placed) => placed.id !== buildingId),
    }).energy < Math.min(0, ColonyWorkforce.colonyWorkforce(colony).energy)
  )
    return DemolitionError.Energy;
  return null;
}
