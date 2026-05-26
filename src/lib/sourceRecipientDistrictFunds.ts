/** ID объекта «HolyCowPhuket» во внутренних объектах. */
export const INTERNAL_COMPANY_OBJECT_ID = -1;

export type DistrictFundSuffix = 'Раваи' | 'Бангтао' | 'Майкхао';

const COMMISSION_BRANCH_BY_SUFFIX: Record<DistrictFundSuffix, string> = {
    Раваи: 'Комиссия Раваи',
    Бангтао: 'Комиссия Бангтао',
    Майкхао: 'Комиссия Майкхао',
};

const MANAGER_BRANCH_BY_SUFFIX: Record<DistrictFundSuffix, string> = {
    Раваи: 'HC-Менеджер Раваи',
    Бангтао: 'HC-Менеджер Бангтао',
    Майкхао: 'HC-Менеджер Майкхао',
};

/** Нормализует значение поля «Район» к одному из трёх фондов. */
export function districtToFundSuffix(district: string | null | undefined): DistrictFundSuffix | null {
    const raw = district != null ? String(district).trim().toLowerCase() : '';
    if (!raw) return null;
    const compact = raw.replace(/\s+/g, '');
    if (/раваи|rawai/.test(compact)) return 'Раваи';
    if (/бангтао|bangtao/.test(compact)) return 'Бангтао';
    if (/майкхао|maikhao|maikao|maikhow/.test(compact)) return 'Майкхао';
    return null;
}

export function commissionFundBranchName(district: string | null | undefined): string | null {
    const suffix = districtToFundSuffix(district);
    return suffix ? COMMISSION_BRANCH_BY_SUFFIX[suffix] : null;
}

export function managerFundBranchName(district: string | null | undefined): string | null {
    const suffix = districtToFundSuffix(district);
    return suffix ? MANAGER_BRANCH_BY_SUFFIX[suffix] : null;
}

export function resolveDistrictForObjectId(
    objects: readonly { id: number; propertyId?: number; district?: string }[],
    objectId: number | null | undefined,
): string | null {
    if (objectId == null) return null;
    const obj = objects.find((o) => o.id === objectId || o.propertyId === objectId);
    const d = obj?.district;
    return d != null && String(d).trim() ? String(d).trim() : null;
}
