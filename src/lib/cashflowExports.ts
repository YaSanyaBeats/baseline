import { apiClient, getApiUrl } from './api-client';
import { extractCommonResponseFromAxiosError } from './axiosResponseMessage';

export type CashflowExportFile = {
    _id: string;
    userId: string;
    cashflowId: string;
    fromMonth: string;
    toMonth: string;
    fileName: string;
    url: string;
    rowCount: number;
    createdAt: string;
    createdByName: string;
};

export async function getCashflowExports(userId: string): Promise<CashflowExportFile[]> {
    try {
        const response = await apiClient.get<{ success: boolean; exports?: CashflowExportFile[] }>(
            getApiUrl('accountancy/cashflow-exports'),
            { params: { userId } },
        );
        return response.data.exports ?? [];
    } catch {
        return [];
    }
}

export async function createCashflowExport(params: {
    userId: string;
    fromMonth: string;
    toMonth: string;
}): Promise<{ success: boolean; message?: string; export?: CashflowExportFile }> {
    try {
        const response = await apiClient.post(getApiUrl('accountancy/cashflow-exports'), params);
        return response.data;
    } catch (error) {
        const parsed = extractCommonResponseFromAxiosError(error);
        return {
            success: false,
            message: parsed?.message || 'Не удалось сформировать файл',
        };
    }
}
