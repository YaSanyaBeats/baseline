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
                maxItems,
                locale: 'en',
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
    airbnb: 'id,seoTitle,isAvailable,price,propertyType,personCapacity,roomType,ratingValue,numberOfReviews,city,url',
    booking: 'price,name,address,rating,reviews,stars,url,rooms',
    agoda: 'priceNightly,geo,starRating,name,url',
    trip: 'priceInclVat,priceExclVat,roomName,hotelName,checkin,checkout,maxOccupancy,url',
};
