'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { User } from '@/lib/types';

// Тип для контекста
interface UserContextType {
    user: User | null;
    isAdmin: boolean;
    isOwner: boolean;
    isPremium: boolean;
    accountType: 'basic' | 'premium' | undefined; 
}

// Создаем контекст
const UserContext = createContext<UserContextType | undefined>(undefined);

// Пропсы для провайдера
interface UserProviderProps {
    children: ReactNode;
    user: User | null;
}

// Основной провайдер
export function UserProvider({ children, user }: UserProviderProps) {
    const isAdmin = user?.role === 'admin';
    const isOwner = user?.role === 'owner';
    const isPremium = user?.accountType === 'premium';
    const accountType = user?.accountType;

    // Значение контекста
    const contextValue: UserContextType = {
        user,
        isAdmin,
        isOwner,
        isPremium,
        accountType,
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

