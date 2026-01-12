// Вспомогательная функция для получения базового URL API
export function getApiUrl(endpoint: string): string {
    // Удаляем начальный слэш из endpoint, если он есть
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    
    // Проверяем, выполняется ли код на сервере
    const isServer = typeof window === 'undefined';
    
    if (isServer) {
        // На сервере нужен полный URL
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        return `${baseUrl}/api/${cleanEndpoint}`;
    }
    
    // На клиенте используем относительный путь
    return `/api/${cleanEndpoint}`;
}

