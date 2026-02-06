import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import {
    isAllowedExtension,
    isWithinSizeLimit,
    MAX_ATTACHMENTS,
    MAX_FILE_SIZE_BYTES,
} from '@/lib/accountancyAttachments';

const UPLOAD_DIR = 'uploads/accountancy';

export async function POST(request: NextRequest) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user) {
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

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (!files.length) {
            return NextResponse.json(
                { success: false, message: 'Файлы не переданы' },
                { status: 400 },
            );
        }

        if (files.length > MAX_ATTACHMENTS) {
            return NextResponse.json(
                { success: false, message: `Максимум ${MAX_ATTACHMENTS} файлов` },
                { status: 400 },
            );
        }

        const results: { name: string; url: string }[] = [];
        const baseDir = path.join(process.cwd(), 'public', UPLOAD_DIR);

        await mkdir(baseDir, { recursive: true });

        for (const file of files) {
            if (!(file instanceof File) || !file.name || file.size === 0) continue;
            if (!isAllowedExtension(file.name)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Недопустимый тип файла: ${file.name}. Разрешены: изображения, документы (pdf, doc, docx и др.), таблицы (xls, xlsx, csv и др.).`,
                    },
                    { status: 400 },
                );
            }

            if (!isWithinSizeLimit(file.size)) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Файл "${file.name}" превышает лимит ${MAX_FILE_SIZE_BYTES / 1024 / 1024} МБ`,
                    },
                    { status: 400 },
                );
            }

            const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${path.extname(file.name)}`;
            const filePath = path.join(baseDir, safeName);
            const buffer = Buffer.from(await file.arrayBuffer());
            await writeFile(filePath, buffer);

            results.push({
                name: file.name,
                url: `/${UPLOAD_DIR}/${safeName}`,
            });
        }

        return NextResponse.json({
            success: true,
            attachments: results,
        });
    } catch (error) {
        console.error('Error in POST /api/accountancy/upload:', error);
        return NextResponse.json(
            { success: false, message: 'Ошибка загрузки файлов' },
            { status: 500 },
        );
    }
}
