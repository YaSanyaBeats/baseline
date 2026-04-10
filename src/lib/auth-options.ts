import CredentialsProvider from 'next-auth/providers/credentials';
import axios from 'axios';
import { DefaultSession, SessionStrategy, User } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';
import { getApiUrl } from './api-client';
import { loadSessionUserFromDb } from '@/lib/server/sessionUserFromDb';
import { userWithPlainId } from '@/lib/plainUser';

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                login: { label: 'Login', type: 'text' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials) {
                if (!credentials) {
                    throw new Error('No credentials');
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
                    if (e instanceof Error) {
                        throw new Error(e.message);
                    } else {
                        throw new Error('INTERNAL ERROR');
                    }
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
                return { ...token, ...user };
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
            return {
                ...session,
                user: user ?? session.user,
            };
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
