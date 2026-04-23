import { signIn, signOut } from 'next-auth/react';

export const handleSignIn = (credentials: { login: string; password: string }) => {
    return signIn('credentials', {
        redirect: false,
        login: credentials.login,
        password: credentials.password,
    });
};

export const handleSignOut = () => signOut();
