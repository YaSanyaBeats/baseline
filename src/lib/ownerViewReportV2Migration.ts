import type { CommissionOwnerViewRoomSection } from '@/lib/commissionOwnerView';
import {
    filterIncomeGroupsForOwnerViewV2,
    sumOwnerViewIncomeTableTotal,
} from '@/lib/ownerViewIncomes';
import { computeOwnerViewRoomEarnings } from '@/lib/ownerViewRoomEarnings';
import { roundAccountancyAmount } from '@/lib/accountancyOverviewSyntheticFill';

/**
 * Приводит секцию комнаты сохранённого отчёта к правилам отображения v2:
 * без группы «Расходы HC» и без категории «Коммунальные, платит гость (электричество + вода)».
 */
export function migrateOwnerViewRoomSectionToV2(
    section: CommissionOwnerViewRoomSection
): CommissionOwnerViewRoomSection {
    const incomeGroups = filterIncomeGroupsForOwnerViewV2(section.incomeGroups);
    const totalIncome = sumOwnerViewIncomeTableTotal(incomeGroups);
    return {
        ...section,
        incomeGroups,
        totals: {
            ...section.totals,
            totalIncome,
        },
    };
}

export function computeOwnerViewV2RoomTotal(section: CommissionOwnerViewRoomSection): number {
    return roundAccountancyAmount(computeOwnerViewRoomEarnings(section, 2).earningsNet);
}
