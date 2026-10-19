import { readFile, stat } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UPLOADS_ROOT = path.join(process.cwd(), 'public', 'uploads');

const CONTENT_TYPES: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text',
    txt: 'text/plain; charset=utf-8',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
};

function resolveUploadFile(segments: string[]): string | null {
    if (segments.length === 0) return null;

    const decoded: string[] = [];
    for (const segment of segments) {
        let name: string;
        try {
            name = decodeURIComponent(segment);
        } catch {
            return null;
        }
        if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
            return null;
        }
        decoded.push(name);
    }

    const root = path.resolve(UPLOADS_ROOT);
    const filePath = path.resolve(root, ...decoded);
    const relative = path.relative(root, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    return filePath;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ path: string[] }> }
) {
    const { path: segments } = await params;
    const filePath = resolveUploadFile(segments ?? []);
    if (!filePath) {
        return new NextResponse('Not found', { status: 404 });
    }

    try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile()) {
            return new NextResponse('Not found', { status: 404 });
        }

        const data = await readFile(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        return new NextResponse(new Uint8Array(data), {
            headers: {
                'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
                'Content-Length': String(fileStat.size),
                'Cache-Control': 'public, max-age=31536000, immutable',
                'X-Content-Type-Options': 'nosniff',
            },
        });
    } catch {
        return new NextResponse('Not found', { status: 404 });
    }
}
