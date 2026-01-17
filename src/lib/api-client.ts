import axios from 'axios';

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

// Создаём инстанс axios с настройками для отключения кеширования GET запросов
export const apiClient = axios.create({
    headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
    },
});

// Добавляем timestamp к GET запросам для предотвращения кеширования
apiClient.interceptors.request.use((config) => {
    if (config.method?.toLowerCase() === 'get' && config.url) {
        // Добавляем timestamp к URL для предотвращения кеширования
        const separator = config.url.includes('?') ? '&' : '?';
        config.url = `${config.url}${separator}_t=${Date.now()}`;
    }
    return config;
});
