import { BuildingType } from '../enum/building-type';
import { Colony } from '../interface/colony';
import { Building } from './building';

export class PowerStation extends Building {
  readonly type = BuildingType.Power;
  readonly code = 'EN';
  readonly name = 'Энергостанция';
  readonly overview =
    'Солнечный энергетический комплекс. Чем ближе планета к солнцу, тем больше свободной энергии добавляется после завершения строительства.';
  readonly costCredits = 100;
  readonly costMinerals = 40;
  override readonly costGas = 10;
  readonly buildTime = 4;
  override readonly energyGain = 16;

  override energyGainFor(planet: Colony['planet']): number {
    if (!Number.isFinite(planet.distanceFromSun) || planet.distanceFromSun <= 0)
      throw new RangeError('Planet distance from the sun must be finite and greater than zero.');
    return Math.round(this.energyGain / planet.distanceFromSun);
  }
}
