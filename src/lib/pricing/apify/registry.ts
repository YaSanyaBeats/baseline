import type { CompetitorPlatform } from '../types';

export type ApifyActorDef = {
    id: string;
    platform: CompetitorPlatform | 'search';
    stage: 'discovery' | 'monitor';
    memoryMb: number;
    estimatedUsd: number;
    allowed: boolean;
};

export const APIFY_ACTORS: ApifyActorDef[] = [
    { id: 'apify/rag-web-browser', platform: 'search', stage: 'discovery', memoryMb: 1024, estimatedUsd: 0.02, allowed: true },
    { id: 'tri_angle/airbnb-rooms-urls-scraper', platform: 'airbnb', stage: 'monitor', memoryMb: 4096, estimatedUsd: 0.08, allowed: true },
    { id: 'voyager/booking-scraper', platform: 'booking', stage: 'monitor', memoryMb: 2048, estimatedUsd: 0.06, allowed: true },
    { id: 'bestscraper/agoda-property-scraper', platform: 'agoda', stage: 'monitor', memoryMb: 2048, estimatedUsd: 0.07, allowed: true },
    { id: 'datawebot/trip-hotel-scraper', platform: 'trip', stage: 'monitor', memoryMb: 1024, estimatedUsd: 0.01, allowed: true },
];

/** Запрещённый актор: поиск Airbnb по площади сжигает бюджет. */
export const BLOCKED_ACTORS = new Set(['tri_angle/airbnb-scraper']);

export function actorById(id: string): ApifyActorDef | null {
    if (BLOCKED_ACTORS.has(id)) return null;
    return APIFY_ACTORS.find((a) => a.id === id) ?? null;
}

export function monitorActorFor(platform: CompetitorPlatform): ApifyActorDef | null {
    return APIFY_ACTORS.find((a) => a.platform === platform && a.stage === 'monitor') ?? null;
}

export function discoveryActor(): ApifyActorDef | null {
    return APIFY_ACTORS.find((a) => a.stage === 'discovery' && a.allowed) ?? null;
}

export function detectPlatform(url: string): CompetitorPlatform | null {
    const u = url.toLowerCase();
    if (u.includes('airbnb.')) return 'airbnb';
    if (u.includes('booking.com')) return 'booking';
    if (u.includes('agoda.')) return 'agoda';
    if (u.includes('trip.com')) return 'trip';
    return null;
}

export function monitorInput(platform: CompetitorPlatform, url: string, checkIn: string, checkOut: string, maxItems: number) {
    switch (platform) {
        case 'airbnb':
            return {
                startUrls: [{ url }],
                checkIn,
                checkOut,
                currency: 'THB',
                adults: 2,
                locale: 'en-US',
            };
        case 'booking':
            return {
                startUrls: [{ url }],
                checkIn,
                checkOut,
                adults: 2,
                rooms: 1,
                currency: 'THB',
                maxItems,
                extractAdditionalHotelData: false,
            };
        case 'agoda':
            return {
                startUrls: [url],
                checkIn,
                checkOut,
                currency: 'THB',
                searchMaxResults: maxItems,
                sortBy: 'PriceAsc',
            };
        case 'trip':
            return {
                hotelUrls: [{ url, name: '' }],
                checkinDate: checkIn,
                checkoutDate: checkOut,
                adults: 2,
                rooms: 1,
            };
        default:
            return { startUrls: [{ url }], maxItems };
    }
}

export const DATASET_FIELDS: Record<CompetitorPlatform, string> = {
    airbnb: 'id,seoTitle,isAvailable,price,propertyType,personCapacity,roomType,rating,ratingValue,numberOfReviews,reviewsCount,city,url',
    booking: 'price,name,address,rating,reviewScore,reviews,reviewsCount,stars,url,rooms',
    agoda: 'priceNightly,geo,starRating,rating,reviewScore,reviewCount,name,url',
    trip: 'priceInclVat,priceExclVat,roomName,hotelName,checkin,checkout,maxOccupancy,url,rating,score,commentScore,reviewCount',
};

export const MONITOR_STAY_NIGHTS = [14, 20] as const;

export function parseMoney(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw || /specify check-in/i.test(raw)) return null;
    let normalized = raw.replace(/[^\d.,-]/g, '');
    if (!normalized) return null;
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
        normalized =
            lastComma > lastDot
                ? normalized.replace(/\./g, '').replace(',', '.')
                : normalized.replace(/,/g, '');
    } else if (lastComma >= 0) {
        normalized = /,\d{3}$/.test(normalized) ? normalized.replace(/,/g, '') : normalized.replace(',', '.');
    }
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function nightlyFromAirbnbDescription(description: unknown): number | null {
    if (typeof description !== 'string') return null;
    const m = description.match(/x\s*฿?\s*([\d.,]+)/i) || description.match(/x\s*([\d.,]+)/i);
    return m ? parseMoney(m[1]) : null;
}

export function extractNightlyPrice(
    platform: CompetitorPlatform,
    item: Record<string, unknown>,
    nights: number,
): number | null {
    if (platform === 'airbnb') {
        const price = item.price as
            | {
                  price?: unknown;
                  label?: unknown;
                  qualifier?: unknown;
                  breakDown?: { basePrice?: { description?: unknown; price?: unknown } };
              }
            | number
            | string
            | undefined;
        if (price && typeof price === 'object') {
            const nightly = nightlyFromAirbnbDescription(price.breakDown?.basePrice?.description);
            if (nightly != null) return nightly;
            const total =
                parseMoney(price.price) ??
                parseMoney(price.label) ??
                parseMoney(price.breakDown?.basePrice?.price);
            if (total != null) return nights > 0 ? Math.round(total / nights) : total;
        }
        return parseMoney(price);
    }
    if (platform === 'booking') {
        const rooms = item.rooms as Array<Record<string, unknown>> | undefined;
        const roomPrice = rooms?.map((r) => parseMoney(r.price ?? r.priceAmount ?? r.minPrice)).find((n) => n != null);
        return (
            parseMoney(item.price) ??
            parseMoney(item.priceFrom) ??
            parseMoney(item.minPrice) ??
            parseMoney(item.displayedPrice) ??
            roomPrice ??
            null
        );
    }
    if (platform === 'agoda') {
        return parseMoney(item.priceNightly) ?? parseMoney(item.price) ?? parseMoney(item.minPrice);
    }
    return parseMoney(item.priceInclVat) ?? parseMoney(item.priceExclVat) ?? parseMoney(item.price);
}

function asFinite(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
        const n = parseFloat(value.replace(',', '.'));
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

export function extractRating(
    platform: CompetitorPlatform,
    item: Record<string, unknown>,
): { rating: number | null; reviews: number | null } {
    const nested = item.rating as
        | { guestSatisfaction?: unknown; value?: unknown; reviewsCount?: unknown; score?: unknown }
        | number
        | string
        | undefined;
    const nestedObj = nested && typeof nested === 'object' ? nested : null;
    const nestedNum = typeof nested === 'number' || typeof nested === 'string' ? nested : null;

    const guest = item.guestReviews as { totalCount?: unknown; count?: unknown; score?: unknown } | undefined;
    if (platform === 'airbnb') {
        return {
            rating:
                asFinite(item.ratingValue) ??
                asFinite(nestedObj?.guestSatisfaction) ??
                asFinite(nestedObj?.value) ??
                asFinite(nestedNum),
            reviews:
                asFinite(item.numberOfReviews) ??
                asFinite(item.reviewsCount) ??
                asFinite(item.visibleReviewCount) ??
                asFinite(nestedObj?.reviewsCount),
        };
    }
    if (platform === 'booking') {
        return {
            rating:
                asFinite(item.reviewScore) ??
                asFinite(guest?.score) ??
                asFinite(item.rating) ??
                asFinite(nestedNum) ??
                asFinite(item.stars),
            reviews: asFinite(item.reviews) ?? asFinite(item.reviewsCount) ?? asFinite(guest?.totalCount) ?? asFinite(guest?.count),
        };
    }
    if (platform === 'agoda') {
        return {
            rating: asFinite(item.reviewScore) ?? asFinite(item.rating) ?? asFinite(item.starRating),
            reviews: asFinite(item.reviewCount) ?? asFinite(item.reviewsCount) ?? asFinite(item.numberOfReviews),
        };
    }
    return {
        rating:
            asFinite(item.commentScore) ??
            asFinite(item.score) ??
            asFinite(item.rating) ??
            asFinite(nestedObj?.score) ??
            asFinite(nestedNum),
        reviews: asFinite(item.reviewCount) ?? asFinite(item.reviewsCount) ?? asFinite(item.commentCount),
    };
}
