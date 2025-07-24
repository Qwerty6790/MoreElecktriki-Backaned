const { cacheUtils } = require('../config/redis');

// Middleware для кэширования GET запросов
const cacheMiddleware = (duration = 300) => { // По умолчанию 5 минут
    return async (req, res, next) => {
        // Кэшируем только GET запросы
        if (req.method !== 'GET') {
            return next();
        }

        // Создаем уникальный ключ на основе URL и query параметров
        const cacheKey = `cache:${req.originalUrl || req.url}`;

        try {
            // Пытаемся получить данные из кэша
            const cachedResponse = await cacheUtils.get(cacheKey);
            
            if (cachedResponse) {
                console.log(`📦 Кэш HIT: ${cacheKey}`);
                return res.json(cachedResponse);
            }

            console.log(`⏳ Кэш MISS: ${cacheKey}`);

            // Переопределяем res.json для сохранения ответа в кэш
            const originalJson = res.json;
            res.json = function(data) {
                // Сохраняем в кэш только успешные ответы
                if (res.statusCode === 200) {
                    cacheUtils.set(cacheKey, data, duration)
                        .then(() => console.log(`💾 Сохранено в кэш: ${cacheKey}`))
                        .catch(err => console.error('Ошибка сохранения в кэш:', err));
                }
                
                // Вызываем оригинальный метод
                originalJson.call(this, data);
            };

        } catch (error) {
            console.error('Ошибка middleware кэша:', error);
        }

        next();
    };
};

// Middleware для инвалидации кэша
const invalidateCacheMiddleware = (patterns) => {
    return async (req, res, next) => {
        const originalJson = res.json;
        
        res.json = function(data) {
            // Инвалидируем кэш после успешного ответа
            if (res.statusCode >= 200 && res.statusCode < 300) {
                if (Array.isArray(patterns)) {
                    patterns.forEach(pattern => {
                        cacheUtils.delPattern(pattern)
                            .then(() => console.log(`🗑️ Инвалидирован кэш: ${pattern}`))
                            .catch(err => console.error('Ошибка инвалидации кэша:', err));
                    });
                } else {
                    cacheUtils.delPattern(patterns)
                        .then(() => console.log(`🗑️ Инвалидирован кэш: ${patterns}`))
                        .catch(err => console.error('Ошибка инвалидации кэша:', err));
                }
            }
            
            originalJson.call(this, data);
        };

        next();
    };
};

// Предустановленные middleware для разных эндпоинтов
const cacheMiddlewares = {
    // Для продуктов - кэш на 10 минут
    products: cacheMiddleware(600),
    
    // Для каталога - кэш на 30 минут
    catalog: cacheMiddleware(1800),
    
    // Для пользователей - кэш на 5 минут
    users: cacheMiddleware(300),
    
    // Быстрый кэш на 1 минуту
    quick: cacheMiddleware(60),
    
    // Долгий кэш на 1 час
    long: cacheMiddleware(3600)
};

// Предустановленные invalidators
const cacheInvalidators = {
    // Инвалидируем кэш продуктов
    products: invalidateCacheMiddleware(['cache:*/api/products*']),
    
    // Инвалидируем кэш пользователей
    users: invalidateCacheMiddleware(['cache:*/api/users*']),
    
    // Инвалидируем весь кэш
    all: invalidateCacheMiddleware(['cache:*'])
};

module.exports = {
    cacheMiddleware,
    invalidateCacheMiddleware,
    cacheMiddlewares,
    cacheInvalidators
}; 