import { apiClient, getApiUrl } from '@/lib/api-client';
import type { CommissionOwnerViewStoredPayload } from '@/lib/commissionOwnerView';
import type { Object as AppObject } from '@/lib/types';

export type LoadCommissionOwnerViewParams = {
    ownerId: string;
    monthKey: string;
    locale: string;
    /** Оставлен для совместимости вызовов; данные объектов подбираются на сервере. */
    objects?: AppObject[];
};

export async function loadCommissionOwnerViewPayload(
    params: LoadCommissionOwnerViewParams
): Promise<CommissionOwnerViewStoredPayload | null> {
    const { ownerId, monthKey, locale } = params;

    try {
        const response = await apiClient.get<CommissionOwnerViewStoredPayload>(
            getApiUrl('accountancy/commission/owner-view'),
            {
                params: { ownerId, month: monthKey, locale },
            }
        );
        return response.data;
    } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404 || status === 403 || status === 400) return null;
        throw error;
    }
}
