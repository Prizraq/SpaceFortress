import * as ColonyFinance from '../../planet/domain/colony-finances';
import * as ColonySimulation from '../../planet/domain/colony-simulation';
import { Colony } from '../../planet/models/interface/colony';
import * as CreditLedger from './credit-ledger';

export function applySessionMaintenance(
  colonies: readonly Colony[],
  credits: number,
  creditRemainder: number,
) {
  const finances = ColonyFinance.sessionFinances(colonies);
  let maintenance = finances.maintenanceCentsPerStep;
  const settle = () =>
    CreditLedger.settleCredits(credits, creditRemainder, finances.incomeCentsPerStep, maintenance);
  let ledger = settle();
  const disabled = new Set<number>();
  const candidates = finances.colonies
    .flatMap((colony) => colony.buildings)
    .filter((building) => building.maintenanceCentsPerStep > 0)
    .sort((first, second) => second.buildingId - first.buildingId);
  for (const building of candidates) {
    if (ledger.maintenanceShortfall === 0) break;
    disabled.add(building.buildingId);
    maintenance -= building.maintenanceCentsPerStep;
    ledger = settle();
  }
  if (ledger.maintenanceShortfall !== 0)
    throw new Error('Финансы: содержание не покрыто после отключения платных зданий.');
  return {
    ...ledger,
    colonies: colonies.map((colony) =>
      colony.buildings.some((building) => disabled.has(building.id))
        ? ColonySimulation.recalculateColonyWorkforce({
            ...colony,
            buildings: colony.buildings.map((building) =>
              disabled.has(building.id)
                ? { ...building, enabled: false, disabledByFinance: true }
                : building,
            ),
          })
        : colony,
    ),
  };
}
