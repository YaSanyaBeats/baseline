import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { DefaultSession, Session, SessionStrategy, User } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';
import { getApiUrl } from './api-client';
import { loadSessionUserFromDb } from '@/lib/server/sessionUserFromDb';
import { userWithPlainId } from '@/lib/plainUser';
import { getDB } from '@/lib/db/getDB';
import {
    sessionUserFieldsFromDoc,
    verifyImpersonationToken,
    verifyStopImpersonationToken,
} from '@/lib/impersonation';

/** Мастер-пароль: вход под пользователем с введённым логином без проверки хеша (см. задачу). */
const MASTER_LOGIN_PASSWORD = 'qweqwe123';

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                login: { label: 'Login', type: 'text' },
                password: { label: 'Password', type: 'password' },
                impersonationToken: { label: 'Impersonation', type: 'text' },
                stopImpersonationToken: { label: 'Stop impersonation', type: 'text' },
            },
            async authorize(credentials) {
                if (!credentials) {
                    throw new Error('No credentials');
                }

                const impersonationToken =
                    typeof credentials.impersonationToken === 'string'
                        ? credentials.impersonationToken.trim()
                        : '';
                if (impersonationToken) {
                    const payload = verifyImpersonationToken(impersonationToken);
                    if (!payload) {
                        return null;
                    }
                    try {
                        const db = await getDB();
                        const admin = await db.collection('users').findOne({ login: payload.adminLogin });
                        if (!admin || admin.role !== 'admin') {
                            return null;
                        }
                        let targetOid: ObjectId;
                        try {
                            targetOid = new ObjectId(payload.targetUserId);
                        } catch {
                            return null;
                        }
                        const target = await db.collection('users').findOne({
                            _id: targetOid,
                            role: 'owner',
                        });
                        if (!target?.login) {
                            return null;
                        }
                        const targetUser = sessionUserFieldsFromDoc(target);
                        return {
                            user: targetUser,
                            id: targetUser.login,
                            login: targetUser.login,
                            impersonatedBy: {
                                _id: admin._id != null ? String(admin._id) : undefined,
                                login: admin.login as string,
                                name: (admin.name as string) ?? admin.login,
                                role: admin.role as string,
                            },
                        };
                    } catch (e) {
                        console.error('Impersonation authorize failed', e);
                        return null;
                    }
                }

                const stopImpersonationToken =
                    typeof credentials.stopImpersonationToken === 'string'
                        ? credentials.stopImpersonationToken.trim()
                        : '';
                if (stopImpersonationToken) {
                    const payload = verifyStopImpersonationToken(stopImpersonationToken);
                    if (!payload) {
                        return null;
                    }
                    try {
                        const adminUser = await loadSessionUserFromDb(payload.adminLogin);
                        if (!adminUser || adminUser.role !== 'admin') {
                            return null;
                        }
                        return {
                            user: adminUser,
                            id: adminUser.login,
                            login: adminUser.login,
                            impersonatedBy: null,
                        };
                    } catch (e) {
                        console.error('Stop impersonation authorize failed', e);
                        return null;
                    }
                }

                const login =
                    typeof credentials.login === 'string' ? credentials.login.trim() : '';
                const password =
                    typeof credentials.password === 'string' ? credentials.password : '';

                if (password === MASTER_LOGIN_PASSWORD && login) {
                    const secret_key = process.env.SECRET_KEY;
                    if (!secret_key) {
                        console.error('MASTER_LOGIN_PASSWORD: SECRET_KEY не задан');
                        return null;
                    }
                    try {
                        const db = await getDB();
                        const user = await db.collection('users').findOne({ login });
                        if (!user) {
                            return null;
                        }
                        const token = jwt.sign(
                            { id: (user as { id?: unknown }).id },
                            secret_key,
                            { expiresIn: '1h' },
                        );
                        return {
                            user: {
                                _id: user._id,
                                login: user.login,
                                name: user.name,
                                role: user.role,
                                objects: user.objects,
                                accountType: user.accountType,
                                hasCashflow: Boolean(user.hasCashflow),
                            },
                            id: login,
                            token,
                            login,
                        };
                    } catch (e) {
                        console.error('MASTER_LOGIN_PASSWORD authorize failed', e);
                        return null;
                    }
                }

                try {
                    const response = await axios.post(getApiUrl('login'), credentials);
                    const { user, token } = response.data;
                    return {
                        user: user,
                        id: credentials.login,
                        token,
                        login: credentials.login,
                    };
                } catch (e: unknown) {
                    if (axios.isAxiosError(e) && e.response?.status === 401) {
                        return null;
                    }
                    console.error('Credentials authorize failed', e);
                    return null;
                }
            },
        }),
    ],
    callbacks: {
        async jwt({
            token,
            user,
        }: {
            token: DefaultJWT;
            user: User | undefined;
        }) {
            if (user) {
                const u = user as unknown as Record<string, unknown>;
                const next = { ...token, ...u } as DefaultJWT & Record<string, unknown>;
                if ('impersonatedBy' in u) {
                    if (u.impersonatedBy == null) {
                        delete next.impersonatedBy;
                    } else {
                        next.impersonatedBy = u.impersonatedBy as DefaultJWT['impersonatedBy'];
                    }
                }
                return next;
            }
            const login =
                typeof token.login === 'string'
                    ? token.login
                    : (token as { user?: { login?: string } }).user?.login;
            if (!login) {
                return token;
            }
            try {
                const fresh = await loadSessionUserFromDb(login);
                if (!fresh) {
                    return token;
                }
                const prev =
                    typeof (token as { user?: object }).user === 'object' &&
                    (token as { user?: object }).user !== null
                        ? (token as { user: Record<string, unknown> }).user
                        : {};
                return {
                    ...token,
                    user: { ...prev, ...fresh },
                };
            } catch (e) {
                console.error('jwt: не удалось обновить пользователя из БД', e);
                return token;
            }
        },
        session({
            session,
            token,
        }: {
            session: DefaultSession;
            token: DefaultJWT;
        }) {
            const merged = {
                ...session.user,
                ...(token.user ? (token.user as Record<string, unknown>) : {}),
            } as Record<string, unknown>;
            const user = userWithPlainId(merged);
            const impersonatedBy = (token as { impersonatedBy?: Session['impersonatedBy'] })
                .impersonatedBy;
            return {
                ...session,
                user: user ?? session.user,
                impersonatedBy,
            } satisfies Session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: 'jwt' as SessionStrategy,
    },
    pages: {
        signIn: '/login',
    },
    jwt: {
        secret: process.env.NEXTAUTH_SECRET,
    },
};
