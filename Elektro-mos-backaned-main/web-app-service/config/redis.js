const redis = require('redis');

// Создаем клиент Redis
const redisClient = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
    },
    password: process.env.REDIS_PASSWORD || undefined,
    // Для продакшена можно добавить URL
    // url: process.env.REDIS_URL
});

// Обработка событий подключения
redisClient.on('connect', () => {
    console.log('🔴 Redis подключен');
});

redisClient.on('ready', () => {
    console.log('🔴 Redis готов к работе');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis ошибка:', err);
});

redisClient.on('end', () => {
    console.log('🔴 Redis отключен');
});

// Подключаемся к Redis
const connectRedis = async () => {
    try {
        await redisClient.connect();
        console.log('✅ Redis успешно подключен');
    } catch (error) {
        console.error('❌ Ошибка подключения к Redis:', error);
        // Не прерываем работу приложения если Redis недоступен
    }
};

// Утилиты для работы с кэшем
const cacheUtils = {
    // Установить значение с TTL (время жизни)
    async set(key, value, ttl = 3600) {
        try {
            const jsonValue = JSON.stringify(value);
            if (ttl) {
                await redisClient.setEx(key, ttl, jsonValue);
            } else {
                await redisClient.set(key, jsonValue);
            }
            return true;
        } catch (error) {
            console.error('Redis SET error:', error);
            return false;
        }
    },

    // Получить значение
    async get(key) {
        try {
            const value = await redisClient.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('Redis GET error:', error);
            return null;
        }
    },

    // Удалить ключ
    async del(key) {
        try {
            await redisClient.del(key);
            return true;
        } catch (error) {
            console.error('Redis DEL error:', error);
            return false;
        }
    },

    // Удалить по паттерну
    async delPattern(pattern) {
        try {
            const keys = await redisClient.keys(pattern);
            if (keys.length > 0) {
                await redisClient.del(keys);
            }
            return true;
        } catch (error) {
            console.error('Redis DEL PATTERN error:', error);
            return false;
        }
    },

    // Проверить существование ключа
    async exists(key) {
        try {
            return await redisClient.exists(key);
        } catch (error) {
            console.error('Redis EXISTS error:', error);
            return false;
        }
    },

    // Установить TTL для существующего ключа
    async expire(key, ttl) {
        try {
            await redisClient.expire(key, ttl);
            return true;
        } catch (error) {
            console.error('Redis EXPIRE error:', error);
            return false;
        }
    }
};

module.exports = {
    redisClient,
    connectRedis,
    cacheUtils
}; 