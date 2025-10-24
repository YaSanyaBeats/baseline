import { signIn, signOut } from 'next-auth/react'
import CredentialsProvider from 'next-auth/providers/credentials'
import axios from 'axios';
import { DefaultSession, SessionStrategy, User } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

export const authOptions = {
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                login: { label: 'Login', type: 'text' },
                password: { label: 'Password', type: 'password' }
            },
            async authorize(credentials) {
                if(!credentials) {
                    throw new Error("No credentials");
                }
                try {
                    const response = await axios.post(process.env.NEXT_PUBLIC_API_URL + 'login', credentials);
                    const { token } = response.data;
                    return {
                        id: credentials.login,
                        token,
                        login: credentials.login
                    };
                } catch (e: unknown) {
                    if (e instanceof Error) {
                        throw new Error(e.message);
                    } else {
                        throw new Error("INTERNAL ERROR");
                    }
                }
            }
        })
    ],
    callbacks: {
        jwt({ token, user }: {
            token: DefaultJWT,
            user: User | undefined
        }) {
            return { ...token, ...user };
        },
        session({ session, token }: { 
            session: DefaultSession, 
            token: DefaultJWT  
        }) {
            return {
                ...session,
                user: {
                ...session.user,
                id: token.id,
                },
            };
        },
    },
    secret: process.env.NEXTAUTH_SECRET,
    session: {
        strategy: "jwt" as SessionStrategy
    },
    pages: {
        signIn: "/login",
    },
    jwt: {
        secret: process.env.NEXTAUTH_SECRET,
    },
}

export const handleSignIn = (credentials: {login: string; password: string }) => {
    signIn('credentials', credentials);
}
export const handleSignOut = () => signOut()
