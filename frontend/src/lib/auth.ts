import { signIn, signOut } from 'next-auth/react'
import Credentials from 'next-auth/providers/credentials'
import axios from 'axios';

export const authOptions = {
    providers: [
        Credentials({
            name: 'Credentials',
            credentials: {
                login: { label: 'Login', type: 'text' },
                password: { label: 'Password', type: 'password' }
            },
            async authorize(credentials: { login: string; password: string }) {
                try {
                    const response = await axios.post(process.env.NEXT_PUBLIC_API_URL + 'login', credentials);
                    const { token } = response.data;
                    return {
                        token,
                        login: credentials.login
                    };
                } catch (e: unknown) {
                    if (e instanceof Error) {
                        console.log(e.message);
                        throw new Error(e.message);
                    } else {
                        throw new Error("INTERNAL ERROR");
                    }
                }
            }
        })
    ],
    callbacks: {
        jwt({ token, user }: any) {
            return { ...token, ...user };
        },
        session({ session, token }: any) {
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
        strategy: "jwt",
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
