import { signIn, signOut } from 'next-auth/react';

export const handleSignIn = (credentials: { login: string; password: string }) => {
    signIn('credentials', credentials);
};

export const handleSignOut = () => signOut();
