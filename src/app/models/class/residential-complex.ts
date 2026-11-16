import { BuildingType } from '../enum/building-type';
import { Building } from './building';

export class ResidentialComplex extends Building {
  readonly type = BuildingType.Housing;
  readonly code = 'HAB';
  readonly name = 'Жилой комплекс';
  readonly overview =
    'Герметичные жилые модули. После завершения строительства лимит населения увеличивается на 20. Занимает 10 энергии.';
  readonly costCredits = 150;
  readonly costMinerals = 40;
  override readonly costWater = 30;
  override readonly costGas = 10;
  override readonly costEnergy = 10;
  readonly buildTime = 6;
  override readonly populationCapacity = 20;
}
