import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { Building } from './building';

export class Farm extends Building {
  readonly type = BuildingType.Farm;
  readonly code = 'FOOD';
  readonly name = 'Ферма';
  readonly overview =
    'Выращивает пищу для населения. Каждые 2 секунды производит 4 пищи, расходуя 1 воды. Без воды работа приостанавливается. Занимает 5 энергии.';
  readonly costCredits = 100;
  readonly costMinerals = 30;
  override readonly costWater = 10;
  override readonly costGas = 5;
  override readonly costEnergy = 5;
  readonly buildTime = 6;
  override readonly production = ProducedResource.Food;
  override readonly productionAmount = 4;
  override readonly workersRequired = 2;
  override readonly waterUse = 1;
}
