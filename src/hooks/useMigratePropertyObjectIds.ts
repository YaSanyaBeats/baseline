'use client';

import { useCallback, useState } from 'react';
import type { MigratePropertyObjectIdsResult } from '@/lib/migrations/migratePropertyObjectIdsToRoomTypeIds';

type MigrateApiResponse = {
    success: boolean;
    message?: string;
    result?: MigratePropertyObjectIdsResult;
};

/**
 * Хук для вызова миграции привязок property ID → roomTypes[0].id (только admin, POST /api/admin/migrate-property-to-roomtype).
 */
export function useMigratePropertyObjectIds() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const migrate = useCallback(async (dryRun: boolean): Promise<MigrateApiResponse> => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/migrate-property-to-roomtype', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun }),
            });
            const data = (await res.json()) as MigrateApiResponse;
            if (!res.ok) {
                const msg = data.message || `HTTP ${res.status}`;
                setError(msg);
                return { success: false, message: msg };
            }
            return data;
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Сетевая ошибка';
            setError(msg);
            return { success: false, message: msg };
        } finally {
            setLoading(false);
        }
    }, []);

    return { migrate, loading, error, clearError: () => setError(null) };
}
