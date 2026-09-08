import type { ObjectType, RoomLevel } from '@/lib/types';
import type { PeriodId, SeasonRegime } from './periods';

export type PricingQuality = 'ok' | 'thin' | 'one-yr' | 'LT-only' | 'est';

export type PricingActionKind = 'raise' | 'hold' | 'cut';

export type IpParameterCell = {
    cluster: string;
    period: PeriodId;
    dates: string;
    regime: SeasonRegime;
    rpi: number;
    elasticityPpPer10pct: number;
    adrFloor: number;
    adrBase: number;
    adrCeiling: number;
    occNorm: number;
    windowMedD: number;
    pickupNorm60d: number;
    pickupNorm30d: number;
    pickupNorm14d: number;
    quality: PricingQuality;
};

export type IpRoom = {
    roomId: number;
    name: string;
    cluster: string;
    units: number;
    propertyId: number | null;
    propertyName: string | null;
    floor: number | null;
    managedFrom: string | null;
    managedTo: string | null;
    needsOnboarding: boolean;
    source: 'seed' | 'live';
    district?: string | null;
    bedrooms?: number | null;
    objectType?: ObjectType | null;
    level?: RoomLevel | null;
};

export type IpOccupancyTarget = {
    level: 'global' | 'cluster' | 'property' | 'room';
    key: string;
    period: PeriodId;
    year: number;
    occTargetPct: number;
};

export type TemperatureSettings = {
    g: number;
    rH: number;
    rS: number;
    rL: number;
    comp: number;
    lm: number;
    pace: number;
    ceil: number;
    shoulder: number;
};

export const DEFAULT_TEMPERATURE: TemperatureSettings = {
    g: 0,
    rH: 0,
    rS: 0,
    rL: 0,
    comp: 50,
    lm: 0,
    pace: 50,
    ceil: 100,
    shoulder: 70,
};

export type ChannelId = 'site' | 'airbnb' | 'booking' | 'agoda' | 'trip';

export type ChannelSettings = {
    coefficients: Record<ChannelId, number>;
    ladders: Record<ChannelId, Array<[nights: number, percent: number]>>;
    lastMinute: Partial<Record<ChannelId, number>>;
};

export const DEFAULT_CHANNELS: ChannelSettings = {
    coefficients: {
        site: 1,
        airbnb: 1.2,
        booking: 1.3,
        agoda: 1.3,
        trip: 1.3,
    },
    ladders: {
        site: [[10, 5], [14, 11], [21, 23], [28, 27], [60, 30]],
        airbnb: [[14, 10], [21, 15], [28, 20]],
        booking: [[14, 10], [21, 15], [28, 20]],
        agoda: [[14, 10], [21, 15], [28, 20]],
        trip: [[14, 10], [21, 15], [28, 20]],
    },
    lastMinute: { site: 10, airbnb: 10 },
};

export type ApifyBudgetSettings = {
    scrapingEnabled: boolean;
    perRunUsd: number;
    perDayUsd: number;
    perMonthUsd: number;
    ttlHours: number;
    timeoutMs: number;
    maxItems: number;
    topNPerObject: number;
};

export const DEFAULT_APIFY_BUDGET: ApifyBudgetSettings = {
    scrapingEnabled: false,
    perRunUsd: 0.35,
    perDayUsd: 0.5,
    perMonthUsd: 2,
    ttlHours: 72,
    timeoutMs: 3 * 60 * 1000,
    maxItems: 1,
    topNPerObject: 5,
};

export type OccupancySlice = {
    inventoryNights: number;
    ownerBlockNights: number;
    ltNights: number;
    stOccupiedNights: number;
    availableNights: number;
    otbPct: number;
    lt: boolean;
};

export type Recommendation = {
    target: number;
    action: PricingActionKind;
    actionLabel: string;
    rpi: number;
    regime: SeasonRegime;
    paceRatio: number | null;
    competitor: number | null;
    deltaToCompPct: number | null;
    deltaToBasePct: number;
    floored: boolean;
    floorWarning: boolean;
    reason: string;
    channelNet: Array<{
        channel: ChannelId;
        k: number;
        price: number;
        maxDiscPct: number;
        net: number;
    }>;
    pEff: number;
};

export type DeskRoomRow = {
    roomId: number;
    name: string;
    units: number;
    occupancy: OccupancySlice;
    recommendation: Recommendation;
    override: number | null;
    appliedPrice: number | null;
    currentPrice: number | null;
    competitorCount: number;
    anchorMode: 'individual' | 'cluster' | 'none';
    flags: Array<'low' | 'hot' | 'nocs' | 'override' | 'lt' | 'new'>;
};

export type DeskClusterRow = {
    cluster: string;
    units: number;
    regime: SeasonRegime;
    quality: PricingQuality;
    occupancy: OccupancySlice;
    recommendation: Recommendation;
    competitor: number | null;
    currentPrice: number | null;
    rooms: DeskRoomRow[];
};

export type DeskPayload = {
    period: PeriodId;
    periodLabel: string;
    year: number;
    window: { start: string; end: string; nights: number };
    daysToArrival: number;
    companyOtbPct: number;
    useCompetitors: boolean;
    temperature: TemperatureSettings;
    clusters: DeskClusterRow[];
    beds24WriteEnabled: false;
};

export type IpJournalEntry = {
    ts: Date;
    userId: string;
    userName: string;
    type: string;
    target: string;
    detail: string;
    payload?: Record<string, unknown>;
};

export type CompetitorPlatform = 'airbnb' | 'booking' | 'agoda' | 'trip';

export type CompetitorStatus = 'approved' | 'candidate' | 'blocked' | 'excluded';

export type IpCompetitor = {
    cluster: string;
    roomId?: number | null;
    platform: CompetitorPlatform;
    url: string;
    name: string;
    bedrooms: number | null;
    sqm: number | null;
    view: string | null;
    status: CompetitorStatus;
    isReference: boolean;
    lastPrice: number | null;
    lastSiteAnchor: number | null;
    lastAvailability: string | null;
    lastRating: number | null;
    lastReviews: number | null;
    lastStayNights: number | null;
    lastPriceByStay?: Partial<Record<14 | 20, number>>;
    lastWarnings: string[];
    lastScrapedAt: Date | null;
    updatedAt: Date | null;
    source?: 'manual' | 'seed' | 'discovery';
};
