import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { runRulesForBookings } from '@/lib/autoAccountingEngine';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as { role?: string }).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json().catch(() => ({}));
        let bookingIds: number[];

        if (body.runForUnprocessed === true) {
            const { getUnprocessedBookingIds } = await import('@/lib/autoAccountingEngine');
            bookingIds = await getUnprocessedBookingIds();
            if (bookingIds.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'Нет новых бронирований для обработки.',
                    created: { expenses: 0, incomes: 0 },
                });
            }
        } else {
            bookingIds = Array.isArray(body.bookingIds)
                ? (body.bookingIds as unknown[]).map((x) => Number(x)).filter((n) => !Number.isNaN(n) && n > 0)
                : [];
            if (bookingIds.length === 0) {
                return NextResponse.json(
                    { success: false, message: 'Укажите хотя бы один ID бронирования (bookingIds) или runForUnprocessed: true' },
                    { status: 400 },
                );
            }
        }

        const accountantId = (session.user as { _id?: string })._id ?? null;
        const result = await runRulesForBookings(bookingIds, accountantId);

        if (result.errors.length > 0) {
            return NextResponse.json({
                success: result.expensesCreated + result.incomesCreated > 0,
                message: `Создано расходов: ${result.expensesCreated}, доходов: ${result.incomesCreated}. Ошибки: ${result.errors.join('; ')}`,
                created: { expenses: result.expensesCreated, incomes: result.incomesCreated },
                errors: result.errors,
            });
        }

        return NextResponse.json({
            success: true,
            message: `Автоучёт выполнен: создано расходов ${result.expensesCreated}, доходов ${result.incomesCreated}.`,
            created: { expenses: result.expensesCreated, incomes: result.incomesCreated },
        });
    } catch (error) {
        console.error('Error in POST /api/autoAccounting/run:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 },
        );
    }
}
