import { BuildingType } from '../enum/building-type';
import { ProducedResource } from '../enum/produced-resource';
import { Building } from './building';

export class MineralMine extends Building {
  readonly type = BuildingType.Minerals;
  readonly code = 'MIN';
  readonly name = 'Минеральная шахта';
  readonly overview =
    'Разрабатывает конечные минеральные запасы планеты. Добыча каждые 2 секунды требует 1 воды. Занимает 5 энергии.';
  readonly costCredits = 120;
  override readonly maintenancePerMinute = 15;
  readonly costMinerals = 30;
  override readonly costWater = 10;
  override readonly costEnergy = 5;
  readonly buildTime = 6;
  override readonly production = ProducedResource.Minerals;
  override readonly productionAmount = 12;
  override readonly workersRequired = 6;
  override readonly waterUse = 1;
}
