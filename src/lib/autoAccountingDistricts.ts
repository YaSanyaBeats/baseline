/** Несколько районов в одном objectMetadataValue правил автоучёта */
export const AUTO_ACCOUNTING_DISTRICT_SEP = '|||';

export function parseAutoAccountingDistrictsStored(value: string | undefined | null): string[] {
    if (value == null || !String(value).trim()) return [];
    const s = String(value).trim();
    if (s.includes(AUTO_ACCOUNTING_DISTRICT_SEP)) {
        return s.split(AUTO_ACCOUNTING_DISTRICT_SEP).map((x) => x.trim()).filter(Boolean);
    }
    return [s];
}

export function serializeAutoAccountingDistricts(districts: string[]): string {
    return districts.map((d) => String(d).trim()).filter(Boolean).join(AUTO_ACCOUNTING_DISTRICT_SEP);
}
