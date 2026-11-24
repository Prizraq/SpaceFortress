import { GasMine } from '../models/class/gas-mine';
import { Farm } from '../models/class/farm';
import { MainBase } from '../models/class/main-base';
import { MineralMine } from '../models/class/mineral-mine';
import { PowerStation } from '../models/class/power-station';
import { ResidentialComplex } from '../models/class/residential-complex';
import { WaterStation } from '../models/class/water-station';
import { BuildingType } from '../models/enum/building-type';
import { BuildingDefinition } from '../models/interface/building-definition';

const definitions: readonly BuildingDefinition[] = [
  new MainBase(),
  new PowerStation(),
  new WaterStation(),
  new MineralMine(),
  new GasMine(),
  new ResidentialComplex(),
  new Farm(),
];

export const BUILDING_CATALOGUE = Object.freeze(
  definitions.map((definition) => Object.freeze(definition)),
);
export const BUILDINGS_BY_TYPE = Object.freeze(
  Object.fromEntries(BUILDING_CATALOGUE.map((definition) => [definition.type, definition])),
) as Readonly<Record<BuildingType, BuildingDefinition>>;
