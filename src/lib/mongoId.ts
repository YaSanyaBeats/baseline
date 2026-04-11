/**
 * Привязка к строке hex ObjectId после JSON/Mongo (в т.ч. Extended JSON { $oid }).
 */
export function normalizeMongoIdString(id: unknown): string {
    if (id == null) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object' && id !== null && '$oid' in id) {
        return String((id as { $oid: string }).$oid);
    }
    if (typeof id === 'object' && id !== null && typeof (id as { toString?: () => string }).toString === 'function') {
        const s = (id as { toString: () => string }).toString();
        if (/^[a-f0-9]{24}$/i.test(s)) return s;
    }
    return String(id);
}
