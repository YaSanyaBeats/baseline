import type { Session } from 'next-auth';

/** Администратор вошёл под аккаунтом владельца (тестовый режим отчётов). */
export function isAdminImpersonatingOwner(session: Session | null | undefined): boolean {
    const user = session?.user as { role?: string } | undefined;
    return (
        user?.role === 'owner' &&
        session?.impersonatedBy?.role === 'admin'
    );
}
