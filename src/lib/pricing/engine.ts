import { channelNetTable, expectedEffectivePrice, worstChannelNetFactor } from './channels';
import type { SeasonRegime } from './periods';
import type {
    ChannelSettings,
    IpParameterCell,
    PricingActionKind,
    Recommendation,
    TemperatureSettings,
} from './types';

const REGIME_RU: Record<SeasonRegime, string> = {
    HIGH: 'Высокий',
    SHOULDER: 'Шов',
    LOW: 'Низкий',
};

export type RecommendInput = {
    cell: IpParameterCell;
    daysToArrival: number;
    occNowPct: number;
    occTargetPct: number;
    competitor: number | null;
    temperature: TemperatureSettings;
    channels: ChannelSettings;
    hardFloor: number;
};

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

export function effectiveRpi(cell: IpParameterCell, t: TemperatureSettings): number {
    let r = cell.rpi + t.g / 100;
    const extra = { HIGH: t.rH, SHOULDER: t.rS, LOW: t.rL }[cell.regime];
    r += extra / 100;
    return clamp(r, 0, 1);
}

function actionFromDelta(deltaPct: number): { action: PricingActionKind; actionLabel: string } {
    if (deltaPct > 4) return { action: 'raise', actionLabel: 'поднять' };
    if (deltaPct < -4) return { action: 'cut', actionLabel: 'снизить' };
    return { action: 'hold', actionLabel: 'держать' };
}

export function recommendPrice(input: RecommendInput): Recommendation {
    const { cell, daysToArrival: D, occNowPct, occTargetPct, competitor, temperature: t, channels, hardFloor } = input;
    const regime = cell.regime;
    const rpi = effectiveRpi(cell, t);
    const ceilF = t.ceil / 100;

    const anchor =
        regime === 'LOW'
            ? cell.adrFloor + rpi * (cell.adrBase - cell.adrFloor)
            : cell.adrBase + rpi * (cell.adrCeiling * ceilF - cell.adrBase);

    let target = anchor;
    const reasons: string[] = [];
    const regimeLabel = REGIME_RU[regime];
    reasons.push(`${regimeLabel}: RPI ${rpi.toFixed(2)} → якорь ${Math.round(anchor)} ฿.`);

    if (competitor != null) {
        const w = t.comp / 100;
        if (regime === 'HIGH') {
            target = anchor * (1 - w) + Math.max(anchor, competitor) * w;
            reasons.push(`${regimeLabel}: рынок ${competitor} ฿ тянет к потолку (вес ${Math.round(w * 100)}%).`);
        } else {
            target = anchor * (1 - w) + Math.min(anchor, competitor * 1.02) * w;
            reasons.push(`${regimeLabel}: рынок ${competitor} ฿ — якорь, не выше рынка.`);
        }
    } else {
        reasons.push('Конкурентов нет — цену ведут RPI и исторические границы.');
    }

    const norm = D >= 45 ? cell.pickupNorm60d : D >= 25 ? cell.pickupNorm30d : cell.pickupNorm14d;
    const occT = occTargetPct || cell.occNorm || 1;
    const paceRatio = occT && norm ? (occNowPct / occT) / (norm / 100) : null;
    const ps = t.pace / 100;

    if (D <= 120 && paceRatio != null) {
        if (paceRatio < 0.6) {
            target *= 1 - 0.1 * ps;
            reasons.push(`Темп ${paceRatio.toFixed(2)} < 0.6 нормы — лёгкая защита загрузки.`);
        } else if (paceRatio > 1.3) {
            target *= 1 + 0.1 * ps;
            reasons.push(`Темп ${paceRatio.toFixed(2)} > 1.3 нормы — лёгкая надбавка.`);
        }
        if (regime === 'SHOULDER' && paceRatio < 1) {
            target *= 1 - 0.1 * (t.shoulder / 100);
            reasons.push('Шов: дополнительная защита загрузки.');
        }
        if (
            t.lm > 0 &&
            (regime === 'LOW' || regime === 'SHOULDER') &&
            D <= Math.max(cell.windowMedD, 10) &&
            occNowPct < 0.8 * occT
        ) {
            target *= 1 - t.lm / 100;
            reasons.push(`Доп. last-minute −${t.lm}% поверх лестницы Beds24.`);
        }
    }

    target = clamp(target, cell.adrFloor, cell.adrCeiling * 1.1);

    let floored = false;
    if (hardFloor > 0) {
        const factor = worstChannelNetFactor(channels);
        const baseMin = Math.round(hardFloor / factor);
        if (target < baseMin) {
            target = baseMin;
            floored = true;
            reasons.push(`Порог NET ${hardFloor} ฿ → база не ниже ${baseMin} ฿.`);
        }
    }

    const rounded = Math.round(target);
    const channelNet = channelNetTable(rounded, channels);
    const worstNet = Math.min(...channelNet.map((row) => row.net));
    const floorWarning = hardFloor > 0 && worstNet < hardFloor;
    const pEff = Math.round(expectedEffectivePrice(rounded, channels));
    const deltaToBasePct = cell.adrBase ? ((rounded - cell.adrBase) / cell.adrBase) * 100 : 0;
    const deltaToCompPct = competitor ? ((rounded - competitor) / competitor) * 100 : null;
    const { action, actionLabel } = actionFromDelta(deltaToBasePct);

    return {
        target: rounded,
        action,
        actionLabel,
        rpi,
        regime,
        paceRatio: paceRatio == null ? null : Math.round(paceRatio * 100) / 100,
        competitor,
        deltaToCompPct,
        deltaToBasePct,
        floored,
        floorWarning,
        reason: reasons.join(' '),
        channelNet,
        pEff,
    };
}
