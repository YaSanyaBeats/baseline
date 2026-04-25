/**
 * Общие условия MongoDB для GET /api/expenses и GET /api/incomes при списковой выборке
 * с фильтрами сводки бухгалтерии (объект(ы) и календарный период + отчётные месяцы).
 */

/** YYYY-MM-DD → инклюзивный UTC-день (как в /api/bookings/search). */
function startOfUtcDayFromIsoDate(iso: string): Date {
    const parts = iso.trim().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
        return new Date(iso);
    }
    const [y, m, d] = parts;
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}

function endOfUtcDayFromIsoDate(iso: string): Date {
    const parts = iso.trim().split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
        return new Date(iso);
    }
    const [y, m, d] = parts;
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function parseYmd(ymd: string): { y: number; m: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]) };
}

/** Месяцы YYYY-MM, попадающие в интервал дат (как reportMonthsInDateRange на клиенте). */
export function reportMonthsInDateRangeStrings(fromStr: string, toStr: string): string[] | null {
    if (!fromStr && !toStr) return null;
    const fromP = fromStr ? parseYmd(fromStr) : parseYmd(toStr!);
    const toP = toStr ? parseYmd(toStr) : parseYmd(fromStr!);
    if (!fromP || !toP) return null;
    let y = fromP.y;
    let mo = fromP.m;
    const endY = toP.y;
    const endM = toP.m;
    const out: string[] = [];
    while (y < endY || (y === endY && mo <= endM)) {
        out.push(`${y}-${String(mo).padStart(2, '0')}`);
        mo++;
        if (mo > 12) {
            mo = 1;
            y++;
        }
    }
    return out;
}

/**
 * Дополняет базовый фильтр (роль / cashflow) условиями из query string.
 * Параметры: objectIds=1,2,3; dateFrom=YYYY-MM-DD; dateTo=YYYY-MM-DD
 * Без параметров возвращает baseFilter без изменений по смыслу (пустой объект = без ограничений).
 */
export function mergeAccountancyListQuery(
    baseFilter: Record<string, unknown>,
    searchParams: Pick<URLSearchParams, 'get'>,
): Record<string, unknown> {
    const objectIdsRaw = searchParams.get('objectIds')?.trim() ?? '';
    const dateFrom = searchParams.get('dateFrom')?.trim() ?? '';
    const dateTo = searchParams.get('dateTo')?.trim() ?? '';

    const extra: Record<string, unknown>[] = [];

    if (objectIdsRaw) {
        const ids = objectIdsRaw
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n));
        if (ids.length) extra.push({ objectId: { $in: ids } });
    }

    if (dateFrom || dateTo) {
        const months = reportMonthsInDateRangeStrings(dateFrom, dateTo);
        const noReportMonth = {
            $or: [
                { reportMonth: { $exists: false } },
                { reportMonth: null },
                { reportMonth: '' },
            ],
        };
        const dateCond: Record<string, Date> = {};
        if (dateFrom) dateCond.$gte = startOfUtcDayFromIsoDate(dateFrom);
        if (dateTo) dateCond.$lte = endOfUtcDayFromIsoDate(dateTo);

        const dateBranch: Record<string, unknown> =
            Object.keys(dateCond).length > 0
                ? { $and: [noReportMonth, { date: dateCond }] }
                : noReportMonth;

        if (months && months.length > 0) {
            extra.push({
                $or: [{ reportMonth: { $in: months } }, dateBranch],
            });
        } else {
            extra.push(dateBranch);
        }
    }

    const hasBase = Object.keys(baseFilter).length > 0;
    if (!hasBase && extra.length === 0) return {};
    if (hasBase && extra.length === 0) return { ...baseFilter };
    if (!hasBase && extra.length === 1) return extra[0];
    if (!hasBase) return { $and: extra };

    const parts = [baseFilter, ...extra];
    return { $and: parts };
}
