import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { Building } from './building';

export class GasMine extends Building {
  readonly type = BuildingType.Gas;
  readonly code = 'GAS';
  readonly name = 'Газовая шахта';
  readonly overview =
    'Извлекает газ каждые 2 секунды, расходуя 1 воды. Останавливается при истощении запасов или нехватке воды. Занимает 5 энергии.';
  readonly costCredits = 120;
  readonly costMinerals = 35;
  override readonly costWater = 10;
  override readonly costEnergy = 5;
  readonly buildTime = 6;
  override readonly production = ProducedResource.Gas;
  override readonly productionAmount = 12;
  override readonly waterUse = 1;
}
