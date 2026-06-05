import { signIn, signOut } from 'next-auth/react';
import { apiClient, getApiUrl } from '@/lib/api-client';

export const handleSignIn = (credentials: { login: string; password: string }) => {
    return signIn('credentials', {
        redirect: false,
        login: credentials.login,
        password: credentials.password,
    });
};

export const handleSignOut = () => signOut();

export async function impersonateOwner(userId: string) {
    const response = await apiClient.post(getApiUrl('users/impersonate'), { userId });
    const token = response.data?.impersonationToken as string | undefined;
    if (!token) {
        throw new Error(response.data?.message ?? 'Не удалось войти под владельцем');
    }
    return signIn('credentials', {
        impersonationToken: token,
        login: '',
        password: '',
        redirect: true,
        callbackUrl: '/dashboard',
    });
}

export async function stopImpersonation() {
    const response = await apiClient.post(getApiUrl('users/stop-impersonate'));
    const token = response.data?.stopImpersonationToken as string | undefined;
    if (!token) {
        throw new Error(response.data?.message ?? 'Не удалось вернуться в исходный аккаунт');
    }
    return signIn('credentials', {
        stopImpersonationToken: token,
        login: '',
        password: '',
        redirect: true,
        callbackUrl: '/dashboard/users',
    });
}
