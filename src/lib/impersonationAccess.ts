import type { Session } from 'next-auth';

/** Администратор вошёл под аккаунтом владельца (тестовый режим отчётов). */
export function isAdminImpersonatingOwner(session: Session | null | undefined): boolean {
    const user = session?.user as { role?: string } | undefined;
    return (
        user?.role === 'owner' &&
        session?.impersonatedBy?.role === 'admin'
    );
}

type ReportsAccessUser = {
    role?: string;
    isOwner?: boolean;
} | null | undefined;

/** Доступ к /dashboard/reports: админ под владельцем или любой владелец (basic/premium). */
export function canAccessReports(
    session: Session | null | undefined,
    user?: ReportsAccessUser,
): boolean {
    if (isAdminImpersonatingOwner(session)) return true;
    if (user?.isOwner != null) {
        return user.isOwner;
    }
    const sessionUser = session?.user as { role?: string } | undefined;
    return sessionUser?.role === 'owner';
}

/** В отчётах доступны только зафиксированные месяцы (владелец / админ под владельцем). */
export function isReportsClosedMonthsOnly(session: Session | null | undefined): boolean {
    return canAccessReports(session);
}
