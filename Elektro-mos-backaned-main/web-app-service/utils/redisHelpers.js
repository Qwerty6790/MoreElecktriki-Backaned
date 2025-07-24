const { cacheUtils } = require('../config/redis');

// Ключи для кэширования
const CACHE_KEYS = {
    PRODUCTS: {
        ALL: (supplier) => `products:all:${supplier}`,
        SEARCH: (query) => `products:search:${encodeURIComponent(query)}`,
        SIMILAR: (productId) => `products:similar:${productId}`,
        SINGLE: (supplier, article) => `product:${supplier}:${article}`,
        CATEGORIES: 'products:categories',
        SUPPLIERS: 'products:suppliers'
    },
    USERS: {
        PROFILE: (userId) => `user:profile:${userId}`,
        ORDERS: (userId) => `user:orders:${userId}`,
        CART: (userId) => `user:cart:${userId}`
    },
    ORDERS: {
        ALL: 'orders:all',
        USER: (userId) => `orders:user:${userId}`,
        STATUS: (status) => `orders:status:${status}`
    },
    SESSIONS: {
        USER: (userId) => `session:user:${userId}`
    }
};

// Время жизни кэша (в секундах)
const CACHE_TTL = {
    VERY_SHORT: 60,      // 1 минута
    SHORT: 300,          // 5 минут  
    MEDIUM: 900,         // 15 минут
    LONG: 1800,          // 30 минут
    VERY_LONG: 3600,     // 1 час
    DAILY: 86400         // 24 часа
};

// Специализированные функции для кэширования продуктов
const productCache = {
    // Кэшировать список продуктов поставщика
    async setProducts(supplier, products, ttl = CACHE_TTL.LONG) {
        const key = CACHE_KEYS.PRODUCTS.ALL(supplier);
        return await cacheUtils.set(key, products, ttl);
    },

    // Получить список продуктов поставщика
    async getProducts(supplier) {
        const key = CACHE_KEYS.PRODUCTS.ALL(supplier);
        return await cacheUtils.get(key);
    },

    // Кэшировать результаты поиска
    async setSearchResults(query, results, ttl = CACHE_TTL.MEDIUM) {
        const key = CACHE_KEYS.PRODUCTS.SEARCH(query);
        return await cacheUtils.set(key, results, ttl);
    },

    // Получить результаты поиска
    async getSearchResults(query) {
        const key = CACHE_KEYS.PRODUCTS.SEARCH(query);
        return await cacheUtils.get(key);
    },

    // Кэшировать отдельный продукт
    async setProduct(supplier, article, product, ttl = CACHE_TTL.LONG) {
        const key = CACHE_KEYS.PRODUCTS.SINGLE(supplier, article);
        return await cacheUtils.set(key, product, ttl);
    },

    // Получить отдельный продукт
    async getProduct(supplier, article) {
        const key = CACHE_KEYS.PRODUCTS.SINGLE(supplier, article);
        return await cacheUtils.get(key);
    },

    // Инвалидировать весь кэш продуктов
    async invalidateAll() {
        await cacheUtils.delPattern('products:*');
        await cacheUtils.delPattern('product:*');
        console.log('🗑️ Инвалидирован весь кэш продуктов');
    },

    // Инвалидировать кэш конкретного поставщика
    async invalidateSupplier(supplier) {
        await cacheUtils.delPattern(`products:*:${supplier}`);
        await cacheUtils.delPattern(`product:${supplier}:*`);
        console.log(`🗑️ Инвалидирован кэш поставщика: ${supplier}`);
    }
};

// Специализированные функции для кэширования пользователей
const userCache = {
    // Кэшировать профиль пользователя
    async setProfile(userId, profile, ttl = CACHE_TTL.MEDIUM) {
        const key = CACHE_KEYS.USERS.PROFILE(userId);
        return await cacheUtils.set(key, profile, ttl);
    },

    // Получить профиль пользователя
    async getProfile(userId) {
        const key = CACHE_KEYS.USERS.PROFILE(userId);
        return await cacheUtils.get(key);
    },

    // Кэшировать корзину пользователя
    async setCart(userId, cart, ttl = CACHE_TTL.SHORT) {
        const key = CACHE_KEYS.USERS.CART(userId);
        return await cacheUtils.set(key, cart, ttl);
    },

    // Получить корзину пользователя
    async getCart(userId) {
        const key = CACHE_KEYS.USERS.CART(userId);
        return await cacheUtils.get(key);
    },

    // Инвалидировать кэш пользователя
    async invalidateUser(userId) {
        await cacheUtils.delPattern(`user:*:${userId}`);
        console.log(`🗑️ Инвалидирован кэш пользователя: ${userId}`);
    }
};

// Специализированные функции для кэширования заказов
const orderCache = {
    // Кэшировать заказы пользователя
    async setUserOrders(userId, orders, ttl = CACHE_TTL.MEDIUM) {
        const key = CACHE_KEYS.ORDERS.USER(userId);
        return await cacheUtils.set(key, orders, ttl);
    },

    // Получить заказы пользователя
    async getUserOrders(userId) {
        const key = CACHE_KEYS.ORDERS.USER(userId);
        return await cacheUtils.get(key);
    },

    // Инвалидировать кэш заказов пользователя
    async invalidateUserOrders(userId) {
        const key = CACHE_KEYS.ORDERS.USER(userId);
        await cacheUtils.del(key);
        console.log(`🗑️ Инвалидирован кэш заказов пользователя: ${userId}`);
    }
};

// Функция для очистки всего кэша
const clearAllCache = async () => {
    try {
        await cacheUtils.delPattern('*');
        console.log('🗑️ Весь кэш очищен');
        return true;
    } catch (error) {
        console.error('Ошибка очистки кэша:', error);
        return false;
    }
};

// Функция для получения статистики кэша
const getCacheStats = async () => {
    try {
        // Получаем информацию о ключах
        const { redisClient } = require('../config/redis');
        const productKeys = await redisClient.keys('products:*');
        const userKeys = await redisClient.keys('user:*');
        const orderKeys = await redisClient.keys('orders:*');
        const sessionKeys = await redisClient.keys('sess:*');

        return {
            products: productKeys.length,
            users: userKeys.length,
            orders: orderKeys.length,
            sessions: sessionKeys.length,
            total: productKeys.length + userKeys.length + orderKeys.length + sessionKeys.length
        };
    } catch (error) {
        console.error('Ошибка получения статистики кэша:', error);
        return null;
    }
};

module.exports = {
    CACHE_KEYS,
    CACHE_TTL,
    productCache,
    userCache,
    orderCache,
    clearAllCache,
    getCacheStats
}; 