const KNOWN_BOOKING_REFERERS = ['Booking.com', 'Airbnb', 'Ctrip'] as const;

/** Подпись канала/источника брони (как в аналитике). */
export function getBookingRefererDisplay(referer: string | null | undefined): string {
    if (!referer) return 'HolyCowPhuket';
    return KNOWN_BOOKING_REFERERS.includes(referer as (typeof KNOWN_BOOKING_REFERERS)[number])
        ? referer
        : 'HolyCowPhuket';
}

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const formattedDate = date.toLocaleDateString('ru-RU').replace(/\./g, '.');
    return formattedDate;
}

const formatTitle = (firstName: string, lastName: string, title: string) => {
    if(title) {
        title = `(${title})`;
    }


    return [firstName, lastName, title].join(' ');
}

export {formatDate, formatTitle}