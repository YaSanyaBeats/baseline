import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth-options';
import type { User } from '@/lib/types';

export type PricingSession = {
    user: User;
};

export async function requirePricingAccess(): Promise<PricingSession | NextResponse> {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
    }
    const user = session.user as User;
    if (user.role !== 'admin') {
        return NextResponse.json(
            { success: false, message: 'Недостаточно прав. Модуль ценообразования доступен администратору.' },
            { status: 403 },
        );
    }
    return { user };
}

export function isPricingSession(value: PricingSession | NextResponse): value is PricingSession {
    return !(value instanceof NextResponse);
}
