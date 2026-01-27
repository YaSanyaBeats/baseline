import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDB } from '@/lib/db/getDB';
import { AccountancyCategory, AccountancyCategoryType } from '@/lib/types';
import { ObjectId } from 'mongodb';

type AccountancyCategoryDb = Omit<AccountancyCategory, '_id'> & { _id?: ObjectId };

export async function GET(request: NextRequest) {
    try {
        const db = await getDB();
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get('type') as AccountancyCategoryType | null;

        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        const filter: Partial<AccountancyCategoryDb> = {};
        if (type === 'expense' || type === 'income') {
            filter.type = type;
        }

        const categories = await collection
            .find(filter)
            .sort({ name: 1 })
            .toArray();

        return NextResponse.json(categories);
    } catch (error) {
        console.error('Error in GET /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const name: string = body.name;
        const type: AccountancyCategoryType = body.type;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json(
                { success: false, message: 'Название категории не может быть пустым' },
                { status: 400 },
            );
        }

        if (type !== 'expense' && type !== 'income') {
            return NextResponse.json(
                { success: false, message: 'Некорректный тип категории' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        const existing = await collection.findOne({
            name: name.trim(),
            type,
        });

        if (existing) {
            return NextResponse.json(
                { success: false, message: 'Такая категория уже существует' },
                { status: 400 },
            );
        }

        await collection.insertOne({
            name: name.trim(),
            type,
            createdAt: new Date(),
        });

        return NextResponse.json({
            success: true,
            message: 'Категория успешно добавлена',
        });
    } catch (error) {
        console.error('Error in POST /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const body = await request.json();
        const id: string = body._id;
        const name: string = body.name;

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID категории не указан' },
                { status: 400 },
            );
        }

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json(
                { success: false, message: 'Название категории не может быть пустым' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        let existing: AccountancyCategoryDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID категории' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Категория не найдена' },
                { status: 404 },
            );
        }

        const duplicate = await collection.findOne({
            _id: { $ne: existing._id },
            name: name.trim(),
            type: existing.type,
        });

        if (duplicate) {
            return NextResponse.json(
                { success: false, message: 'Такая категория уже существует' },
                { status: 400 },
            );
        }

        await collection.updateOne(
            { _id: existing._id },
            { $set: { name: name.trim() } },
        );

        return NextResponse.json({
            success: true,
            message: 'Категория успешно обновлена',
        });
    } catch (error) {
        console.error('Error in PUT /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json(
                { success: false, message: 'Необходима авторизация' },
                { status: 401 },
            );
        }

        const userRole = (session.user as any).role;
        if (userRole !== 'accountant' && userRole !== 'admin') {
            return NextResponse.json(
                { success: false, message: 'Недостаточно прав' },
                { status: 403 },
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { success: false, message: 'ID категории не указан' },
                { status: 400 },
            );
        }

        const db = await getDB();
        const collection = db.collection<AccountancyCategoryDb>('accountancyCategories');

        let existing: AccountancyCategoryDb | null = null;
        try {
            existing = await collection.findOne({ _id: new ObjectId(id) });
        } catch {
            return NextResponse.json(
                { success: false, message: 'Некорректный ID категории' },
                { status: 400 },
            );
        }

        if (!existing) {
            return NextResponse.json(
                { success: false, message: 'Категория не найдена' },
                { status: 404 },
            );
        }

        await collection.deleteOne({ _id: existing._id });

        return NextResponse.json({
            success: true,
            message: 'Категория успешно удалена',
        });
    } catch (error) {
        console.error('Error in DELETE /api/accountancyCategories:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 },
        );
    }
}


