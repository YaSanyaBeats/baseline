import type { Session } from 'next-auth';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

/**
 * Проверка ?cashflowId= для GET /api/expenses и /api/incomes:
 * запись кэшфлоу существует; не-admin/accountant может фильтровать только своё кэшфлоу (userId).
 */
export async function verifyCashflowIdForTransactionList(
    db: Db,
    session: Session,
    cashflowIdRaw: string,
): Promise<
    | { ok: true; normalizedId: string }
    | { ok: false; status: number; message: string }
> {
    let cfOid: ObjectId;
    try {
        cfOid = new ObjectId(cashflowIdRaw);
    } catch {
        return { ok: false, status: 400, message: 'Некорректный ID кэшфлоу' };
    }

    const cf = await db.collection('cashflows').findOne({ _id: cfOid });
    if (!cf) {
        return { ok: false, status: 404, message: 'Кэшфлоу не найден' };
    }

    const user = session.user as { role?: string; _id?: string | { toString: () => string } };
    const userRole = user?.role;
    const sessionUserId = user?._id != null ? String(user._id) : '';

    if (userRole !== 'admin' && userRole !== 'accountant') {
        const cfUserId = cf.userId != null ? String(cf.userId) : '';
        if (!cfUserId || cfUserId !== sessionUserId) {
            return { ok: false, status: 403, message: 'Недостаточно прав' };
        }
    }

    return { ok: true, normalizedId: cfOid.toString() };
}

/** Условие по cashflowId в Mongo (строка и ObjectId в данных). */
export function cashflowIdMongoClause(normalizedHexId: string): Record<string, unknown> {
    try {
        const oid = new ObjectId(normalizedHexId);
        return { cashflowId: { $in: [normalizedHexId, oid] } };
    } catch {
        return { cashflowId: normalizedHexId };
    }
}
