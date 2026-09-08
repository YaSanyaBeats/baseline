import { getDB } from '@/lib/db/getDB';
import { IP_COLLECTIONS } from '../collections';
import { getApifyBudget } from '../seed';

export class ApifyBudgetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ApifyBudgetError';
    }
}

export async function spentSince(from: Date): Promise<number> {
    const db = await getDB();
    const rows = await db
        .collection(IP_COLLECTIONS.apifyCosts)
        .aggregate([{ $match: { createdAt: { $gte: from } } }, { $group: { _id: null, sum: { $sum: '$costUsd' } } }])
        .toArray();
    return Number(rows[0]?.sum || 0);
}

export async function assertCanRun(estimatedUsd: number): Promise<{ daySpent: number; monthSpent: number; settings: Awaited<ReturnType<typeof getApifyBudget>> }> {
    const settings = await getApifyBudget();
    if (!settings.scrapingEnabled) {
        throw new ApifyBudgetError('Скрейпинг выключен стоп-краном.');
    }
    if (!process.env.APIFY_TOKEN) {
        throw new ApifyBudgetError('Не задан APIFY_TOKEN в окружении.');
    }
    if (estimatedUsd > settings.perRunUsd) {
        throw new ApifyBudgetError(`Оценка прогона $${estimatedUsd.toFixed(2)} выше лимита на запуск $${settings.perRunUsd}.`);
    }

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [daySpent, monthSpent] = await Promise.all([spentSince(dayStart), spentSince(monthStart)]);

    if (daySpent + estimatedUsd > settings.perDayUsd) {
        throw new ApifyBudgetError(`Дневной лимит Apify $${settings.perDayUsd} исчерпан (уже $${daySpent.toFixed(2)}).`);
    }
    if (monthSpent + estimatedUsd > settings.perMonthUsd) {
        throw new ApifyBudgetError(`Месячный лимит Apify $${settings.perMonthUsd} исчерпан (уже $${monthSpent.toFixed(2)}).`);
    }

    return { daySpent, monthSpent, settings };
}

export async function recordCost(params: {
    runId: string;
    actorId: string;
    platform: string;
    costUsd: number;
    usefulItems: number;
    runType: 'manual' | 'schedule' | 'discovery';
    roomId?: number;
    cluster?: string;
}) {
    const db = await getDB();
    await db.collection(IP_COLLECTIONS.apifyCosts).insertOne({
        ...params,
        createdAt: new Date(),
    });
}
