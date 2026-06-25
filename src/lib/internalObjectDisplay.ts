import type { AppLanguage } from '@/lib/accountancyCategoryResolve';

export type InternalObjectRoomNameFields = {
    name: string;
    nameEn?: string | null;
};

/** Отображаемое название филиала внутреннего объекта с учётом языка интерфейса. */
export function getInternalObjectRoomDisplayName(
    room: InternalObjectRoomNameFields,
    language: AppLanguage = 'ru',
): string {
    if (language === 'en') {
        const en = room.nameEn != null ? String(room.nameEn).trim() : '';
        if (en) return en;
    }
    return String(room.name ?? '').trim();
}
