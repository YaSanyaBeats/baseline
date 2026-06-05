import jwt from 'jsonwebtoken';

const IMPERSONATION_TOKEN_TTL = '5m';

type ImpersonatePayload = {
    type: 'impersonate';
    adminLogin: string;
    targetUserId: string;
};

type StopImpersonatePayload = {
    type: 'stop_impersonate';
    adminLogin: string;
};

function getSecret(): string | null {
    return process.env.NEXTAUTH_SECRET ?? process.env.SECRET_KEY ?? null;
}

export function createImpersonationToken(adminLogin: string, targetUserId: string): string | null {
    const secret = getSecret();
    if (!secret) return null;
    const payload: ImpersonatePayload = {
        type: 'impersonate',
        adminLogin,
        targetUserId,
    };
    return jwt.sign(payload, secret, { expiresIn: IMPERSONATION_TOKEN_TTL });
}

export function createStopImpersonationToken(adminLogin: string): string | null {
    const secret = getSecret();
    if (!secret) return null;
    const payload: StopImpersonatePayload = {
        type: 'stop_impersonate',
        adminLogin,
    };
    return jwt.sign(payload, secret, { expiresIn: IMPERSONATION_TOKEN_TTL });
}

export function verifyImpersonationToken(token: string): ImpersonatePayload | null {
    const secret = getSecret();
    if (!secret) return null;
    try {
        const decoded = jwt.verify(token, secret) as ImpersonatePayload;
        if (decoded?.type !== 'impersonate' || !decoded.adminLogin || !decoded.targetUserId) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

export function verifyStopImpersonationToken(token: string): StopImpersonatePayload | null {
    const secret = getSecret();
    if (!secret) return null;
    try {
        const decoded = jwt.verify(token, secret) as StopImpersonatePayload;
        if (decoded?.type !== 'stop_impersonate' || !decoded.adminLogin) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

export type ImpersonationAdminSnapshot = {
    _id?: string;
    login: string;
    name: string;
    role: string;
};

export function sessionUserFieldsFromDoc(doc: Record<string, unknown>) {
    return {
        _id: doc._id != null ? String(doc._id) : undefined,
        login: doc.login as string,
        name: doc.name as string,
        role: doc.role as string,
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
