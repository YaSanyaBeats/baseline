import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { createStopImpersonationToken } from '@/lib/impersonation';

export async function POST() {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
            return NextResponse.json({ success: false, message: 'Необходима авторизация' }, { status: 401 });
        }

        const impersonatedBy = session.impersonatedBy as
            | { login: string; name?: string; role?: string; _id?: string }
            | undefined;
        if (!impersonatedBy?.login) {
            return NextResponse.json(
                { success: false, message: 'Режим просмотра не активен' },
                { status: 400 }
            );
        }

        const stopImpersonationToken = createStopImpersonationToken(impersonatedBy.login);
        if (!stopImpersonationToken) {
            return NextResponse.json(
                { success: false, message: 'Не удалось создать токен' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, stopImpersonationToken });
    } catch (error) {
        console.error('Error in POST /api/users/stop-impersonate:', error);
        return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
}
