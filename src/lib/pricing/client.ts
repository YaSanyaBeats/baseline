import { apiClient, getApiUrl } from '@/lib/api-client';
import type { DeskPayload, TemperatureSettings, ChannelSettings } from './types';
import type { PeriodId } from './periods';

export async function fetchPricingDesk(
    period: PeriodId,
    days: number,
    useCompetitors: boolean,
    year: number,
): Promise<DeskPayload> {
    const { data } = await apiClient.get(getApiUrl('pricing/desk'), {
        params: { period, days, year, comp: useCompetitors ? 1 : 0 },
    });
    if (!data.success) throw new Error(data.message || 'desk error');
    return data.data;
}

export async function acceptRecommendation(payload: {
    roomId?: number | null;
    cluster?: string | null;
    period: string;
    year?: number;
    price: number;
    reason?: string;
    previousPrice?: number | null;
}) {
    const { data } = await apiClient.post(getApiUrl('pricing/accept'), payload);
    return data;
}

export async function saveOverride(roomId: number, period: string, price: number, year?: number) {
    const { data } = await apiClient.put(getApiUrl('pricing/overrides'), { roomId, period, price, year });
    return data;
}

export async function clearOverride(roomId: number, period: string, year?: number) {
    const { data } = await apiClient.delete(getApiUrl('pricing/overrides'), { params: { roomId, period, year } });
    return data;
}

export async function fetchClusters() {
    const { data } = await apiClient.get(getApiUrl('pricing/clusters'));
    return data.data;
}

export async function patchCluster(body: Record<string, unknown>) {
    const { data } = await apiClient.patch(getApiUrl('pricing/clusters'), body);
    return data;
}

export async function fetchTemperature() {
    const { data } = await apiClient.get(getApiUrl('pricing/temperature'));
    return data.data as { temperature: TemperatureSettings; channels: ChannelSettings };
}

export async function saveTemperature(payload: { temperature?: TemperatureSettings; channels?: ChannelSettings }) {
    const { data } = await apiClient.put(getApiUrl('pricing/temperature'), payload);
    return data;
}

export async function fetchDemand() {
    const { data } = await apiClient.get(getApiUrl('pricing/parameters'));
    return data.data;
}

export async function savePeriodRpi(period: string, rpi: number) {
    const { data } = await apiClient.put(getApiUrl('pricing/parameters'), { period, rpi });
    return data;
}

export async function saveTarget(period: string, occTargetPct: number) {
    const { data } = await apiClient.put(getApiUrl('pricing/targets'), { period, occTargetPct });
    return data;
}

export async function fetchJournal(params?: { type?: string; userName?: string }) {
    const { data } = await apiClient.get(getApiUrl('pricing/journal'), { params });
    return data;
}

export async function fetchCompetitors() {
    const { data } = await apiClient.get(getApiUrl('pricing/competitors'));
    return data.data;
}

export async function addCompetitors(cluster: string, urls: string[], name?: string) {
    const { data } = await apiClient.post(getApiUrl('pricing/competitors'), { cluster, urls, name });
    return data;
}

export async function patchCompetitor(id: string, patch: Record<string, unknown>) {
    const { data } = await apiClient.patch(getApiUrl('pricing/competitors'), { id, ...patch });
    return data;
}

export async function fetchApifyStatus() {
    const { data } = await apiClient.get(getApiUrl('pricing/apify'));
    return data.data;
}

export async function runApify(competitorId: string, period: string) {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'run', competitorId, period });
    return data;
}

export async function estimateApify(platform: string) {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'estimate', platform });
    return data;
}

export async function stopApify() {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'stop' });
    return data;
}

export async function enableApify() {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'enable' });
    return data;
}

export async function resetApifyLimits() {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'resetLimits' });
    return data;
}

export async function discoverCluster(cluster: string, platform: string) {
    const { data } = await apiClient.post(getApiUrl('pricing/apify'), { action: 'discover', cluster, platform });
    return data;
}
