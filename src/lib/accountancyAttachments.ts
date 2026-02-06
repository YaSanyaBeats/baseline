import type { AccountancyAttachment } from './types';

/** Допустимые расширения: изображения, документы, таблицы */
export const ALLOWED_EXTENSIONS = [
    // изображения
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
    // документы
    'pdf', 'doc', 'docx', 'odt', 'txt',
    // таблицы
    'xls', 'xlsx', 'csv', 'ods',
] as const;

export const ALLOWED_EXTENSIONS_SET = new Set<string>(ALLOWED_EXTENSIONS);

export const MAX_ATTACHMENTS = 5;
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

export function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot + 1).toLowerCase();
}

export function isAllowedExtension(filename: string): boolean {
    return ALLOWED_EXTENSIONS_SET.has(getFileExtension(filename));
}

export function isWithinSizeLimit(sizeBytes: number): boolean {
    return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}

/** Строка для input accept (для выбора файлов в браузере) */
export const ACCEPT_ATTACHMENTS =
    '.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.pdf,.doc,.docx,.odt,.txt,.xls,.xlsx,.csv,.ods';

export type { AccountancyAttachment };
