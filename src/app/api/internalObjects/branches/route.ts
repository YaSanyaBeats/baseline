import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addCompanyBranch, removeCompanyBranch, renameCompanyBranch } from '@/lib/server/internalObjects';

/**
 * API для управления филиалами объекта "HolyCowPhuket внутренний объект"
 * Доступ: только для администраторов
 */

// Добавление нового филиала
export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только администратор может управлять филиалами.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { branchName } = body;

        if (!branchName || typeof branchName !== 'string' || branchName.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: 'Название филиала не может быть пустым' },
                { status: 400 }
            );
        }

        const result = await addCompanyBranch(branchName.trim());
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in POST /api/internalObjects/branches:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

// Удаление филиала
export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только администратор может управлять филиалами.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { branchId } = body;

        if (typeof branchId !== 'number') {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID филиала' },
                { status: 400 }
            );
        }

        const result = await removeCompanyBranch(branchId);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in DELETE /api/internalObjects/branches:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}

// Переименование филиала
export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 }
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав. Только администратор может управлять филиалами.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { branchId, newName } = body;

        if (typeof branchId !== 'number' || !newName || typeof newName !== 'string' || newName.trim().length === 0) {
            return NextResponse.json(
                { success: false, message: 'Некорректные параметры запроса' },
                { status: 400 }
            );
        }

        const result = await renameCompanyBranch(branchId, newName.trim());
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error in PUT /api/internalObjects/branches:', error);
        return NextResponse.json(
            { success: false, message: 'Внутренняя ошибка сервера' },
            { status: 500 }
        );
    }
}
