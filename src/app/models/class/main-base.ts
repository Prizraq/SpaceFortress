import { BuildingType } from '../enum/building-type';
import { Building } from './building';

export class MainBase extends Building {
  readonly type = BuildingType.Base;
  readonly code = 'HQ';
  readonly name = 'Главная база';
  readonly overview =
    'Командный центр колонии. Даёт 10 энергии, места для 5 жителей и снабжает их водой и пищей: 0,5 воды и 1 пищи каждые 2 секунды. Одна база на планету. Снос невозможен.';
  readonly costCredits = 200;
  readonly costMinerals = 60;
  override readonly costWater = 20;
  readonly buildTime = 4;
  override readonly energyGain = 10;
  override readonly populationGain = 5;
  override readonly populationCapacity = 5;
  override readonly waterSupply = 0.5;
  override readonly foodSupply = 1;
}
