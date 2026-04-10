import { getDB } from '@/lib/db/getDB';

/** Поля пользователя из БД без пароля — совпадают с ответом /api/login и /api/user/me */
export async function loadSessionUserFromDb(login: string) {
    const db = await getDB();
    const doc = await db.collection('users').findOne(
        { login },
        { projection: { password: 0 } },
    );
    if (!doc) return null;
    return {
        _id: doc._id != null ? String(doc._id) : undefined,
        login: doc.login,
        name: doc.name,
        role: doc.role,
        objects: doc.objects,
        email: doc.email,
        phone: doc.phone,
        bankName: doc.bankName,
        accountNumber: doc.accountNumber,
        accountType: doc.accountType,
        reportLink: doc.reportLink,
        hasCashflow: Boolean(doc.hasCashflow),
    };
}
