import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { Building } from './building';

export class WaterStation extends Building {
  readonly type = BuildingType.Water;
  readonly code = 'H₂O';
  readonly name = 'Водная станция';
  readonly overview =
    'Извлекает и очищает воду. Производительность зависит от содержания воды на планете. Занимает 5 энергии.';
  readonly costCredits = 90;
  readonly costMinerals = 25;
  override readonly costGas = 5;
  override readonly costEnergy = 5;
  readonly buildTime = 4;
  override readonly production = ProducedResource.Water;
  override readonly productionAmount = 12;
  override readonly workersRequired = 3;
}
