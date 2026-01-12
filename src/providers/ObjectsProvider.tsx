// providers/ObjectsProvider.tsx
'use client';

import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { Object } from "@/lib/types";
import { getObjects } from '@/lib/beds24/objects';

// Тип для контекста
interface ObjectsContextType {
    objects: Object[];
    loading: boolean;
    error: string | null;
    refreshObjects: () => Promise<Object[]>;
}

// Создаем контекст
const ObjectsContext = createContext<ObjectsContextType | undefined>(undefined);

// Пропсы для провайдера
interface ObjectsProviderProps {
    children: ReactNode;
    serverObjects: Object[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: any
}

// Основной провайдер
export function ObjectsProvider({ children, serverObjects, session }: ObjectsProviderProps) {
    const [objects, setObjects] = useState<Object[]>(serverObjects);
    const [loading] = useState(false);
    const [error] = useState<string | null>(null);

    // Синхронизируем состояние с serverProps при изменении
    useEffect(() => {
        setObjects(serverObjects);
    }, [serverObjects]);

    // Функция для обновления объектов
    const refreshObjects = async () => {
        
        try {
            const fetchedObjects = await getObjects(session);
            setObjects(fetchedObjects);
            return fetchedObjects;

            
        } catch (err) {
            throw err;
        }
    };

    // Значение контекста
    const contextValue: ObjectsContextType = {
        objects,
        loading,
        error,
        refreshObjects,
    };

    return (
        <ObjectsContext.Provider value={contextValue}>
        {children}
        </ObjectsContext.Provider>
    );
}

// Хук для использования контекста в клиентских компонентах
export function useObjects() {
    const context = useContext(ObjectsContext);

    if (context === undefined) {
        throw new Error('useObjects должен использоваться внутри ObjectsProvider');
    }

    return context;
}

export default ObjectsProvider;