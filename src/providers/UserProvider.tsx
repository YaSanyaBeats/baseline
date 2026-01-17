'use client';

import React, { createContext, useContext, ReactNode, useState, useEffect, useCallback } from 'react';
import { User } from '@/lib/types';
import { getApiUrl, apiClient } from '@/lib/api-client';

// Тип для контекста
interface UserContextType {
    user: User | null;
    isAdmin: boolean;
    isOwner: boolean;
    isAccountant: boolean;
    isPremium: boolean;
    accountType: 'basic' | 'premium';
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

// Создаем контекст
const UserContext = createContext<UserContextType | undefined>(undefined);

// Пропсы для провайдера
interface UserProviderProps {
    children: ReactNode;
    user: User | null;
}

// Основной провайдер
export function UserProvider({ children, user: initialUser }: UserProviderProps) {
    const [user, setUser] = useState<User | null>(initialUser);
    const [isLoading, setIsLoading] = useState(false);

    // Функция для обновления данных пользователя
    const refreshUser = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await apiClient.get(getApiUrl('user/me'));
            const updatedUser = response.data;
            setUser(updatedUser);
        } catch (error) {
            console.error('Error refreshing user data:', error);
            // В случае ошибки оставляем старые данные
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Обновляем данные при монтировании компонента
    useEffect(() => {
        refreshUser();
    }, [refreshUser]);

    // Обновляем данные при возврате фокуса на окно (когда пользователь возвращается на вкладку)
    // Используем debounce, чтобы не делать слишком много запросов
    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        
        const handleFocus = () => {
            // Очищаем предыдущий таймер, если он есть
            clearTimeout(timeoutId);
            // Устанавливаем новый таймер на 500ms
            timeoutId = setTimeout(() => {
                refreshUser();
            }, 500);
        };

        window.addEventListener('focus', handleFocus);
        return () => {
            window.removeEventListener('focus', handleFocus);
            clearTimeout(timeoutId);
        };
    }, [refreshUser]);

    // Обновляем данные при изменении initialUser (если он изменился на сервере)
    useEffect(() => {
        if (initialUser) {
            setUser(initialUser);
        }
    }, [initialUser]);

    const isAdmin = user?.role === 'admin';
    const isOwner = user?.role === 'owner';
    const isAccountant = user?.role === 'accountant';
    const accountType =  isAdmin || isAccountant ? 'premium' : (user?.accountType ? user?.accountType : 'basic'); // Значение по умолчанию 'premium' для admin и accountant, 'basic' для остальных
    const isPremium = accountType === 'premium';

    // Значение контекста
    const contextValue: UserContextType = {
        user,
        isAdmin,
        isOwner,
        isAccountant,
        isPremium,
        accountType,
        refreshUser,
        isLoading,
    };

    return (
        <UserContext.Provider value={contextValue}>
            {children}
        </UserContext.Provider>
    );
}

// Хук для использования контекста в клиентских компонентах
export function useUser() {
    const context = useContext(UserContext);

    if (context === undefined) {
        throw new Error('useUser должен использоваться внутри UserProvider');
    }

    return context;
}

export default UserProvider;

