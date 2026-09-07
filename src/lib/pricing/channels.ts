import type { ChannelId, ChannelSettings } from './types';

export function maxLadderDiscount(ladder: Array<[number, number]>): number {
    if (!ladder.length) return 0;
    return Math.max(...ladder.map(([, pct]) => pct));
}

export function discountForNights(ladder: Array<[number, number]>, nights: number): number {
    let d = 0;
    const sorted = [...ladder].sort((a, b) => a[0] - b[0]);
    for (const [n, pct] of sorted) {
        if (nights >= n) d = pct;
    }
    return d;
}

export function worstChannelNetFactor(channels: ChannelSettings, enabled: ChannelId[] = ['site', 'airbnb', 'booking', 'agoda', 'trip']): number {
    let min = 1;
    for (const ch of enabled) {
        const k = channels.coefficients[ch] ?? 1;
        const disc = maxLadderDiscount(channels.ladders[ch] || []) / 100;
        const lm = (channels.lastMinute[ch] ?? 0) / 100;
        const factor = k * (1 - disc - lm);
        if (factor < min) min = factor;
    }
    return Math.max(0.01, min);
}

export function channelNetTable(
    base: number,
    channels: ChannelSettings,
    enabled: ChannelId[] = ['site', 'airbnb', 'booking', 'agoda', 'trip'],
) {
    return enabled.map((channel) => {
        const k = channels.coefficients[channel] ?? 1;
        const maxDiscPct = maxLadderDiscount(channels.ladders[channel] || []) + (channels.lastMinute[channel] ?? 0);
        const price = Math.round(base * k);
        const net = Math.round(base * k * (1 - maxDiscPct / 100));
        return { channel, k, price, maxDiscPct, net };
    });
}

export function otaToSite(priceOta: number, platform: ChannelId, channels: ChannelSettings): number {
    const k = channels.coefficients[platform] ?? 1;
    if (!k) return priceOta;
    return priceOta / k;
}

export function expectedEffectivePrice(
    base: number,
    channels: ChannelSettings,
    shares: Partial<Record<ChannelId, number>> = { site: 0.4, airbnb: 0.3, booking: 0.2, trip: 0.1 },
    alos = 21,
): number {
    let sum = 0;
    let w = 0;
    (Object.keys(shares) as ChannelId[]).forEach((ch) => {
        const share = shares[ch] ?? 0;
        if (share <= 0) return;
        const k = channels.coefficients[ch] ?? 1;
        const disc = discountForNights(channels.ladders[ch] || [], alos) / 100;
        sum += share * base * k * (1 - disc);
        w += share;
    });
    return w ? sum / w : base;
}
