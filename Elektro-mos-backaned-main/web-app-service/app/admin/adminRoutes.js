const express = require('express');
const router = express.Router();
const { getCacheStats, clearAllCache, productCache } = require('../../utils/redisHelpers');
const { cacheUtils } = require('../../config/redis');

// Получить статистику кэша
router.get('/admin/cache/stats', async (req, res) => {
    try {
        const stats = await getCacheStats();
        
        if (!stats) {
            return res.status(500).json({
                success: false,
                message: 'Ошибка получения статистики кэша'
            });
        }

        res.json({
            success: true,
            data: {
                cache_stats: stats,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Ошибка получения статистики кэша:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Очистить весь кэш
router.delete('/admin/cache/clear-all', async (req, res) => {
    try {
        const result = await clearAllCache();
        
        if (result) {
            res.json({
                success: true,
                message: 'Весь кэш успешно очищен'
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Ошибка очистки кэша'
            });
        }
    } catch (error) {
        console.error('Ошибка очистки кэша:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Очистить кэш продуктов
router.delete('/admin/cache/clear-products', async (req, res) => {
    try {
        await productCache.invalidateAll();
        
        res.json({
            success: true,
            message: 'Кэш продуктов успешно очищен'
        });
    } catch (error) {
        console.error('Ошибка очистки кэша продуктов:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Очистить кэш конкретного поставщика
router.delete('/admin/cache/clear-supplier/:supplier', async (req, res) => {
    try {
        const { supplier } = req.params;
        await productCache.invalidateSupplier(supplier);
        
        res.json({
            success: true,
            message: `Кэш поставщика ${supplier} успешно очищен`
        });
    } catch (error) {
        console.error('Ошибка очистки кэша поставщика:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Получить список ключей по паттерну
router.get('/admin/cache/keys/:pattern', async (req, res) => {
    try {
        const { pattern } = req.params;
        const { redisClient } = require('../../config/redis');
        const keys = await redisClient.keys(pattern);
        
        res.json({
            success: true,
            data: {
                pattern,
                count: keys.length,
                keys: keys.slice(0, 100) // Ограничиваем вывод первыми 100 ключами
            }
        });
    } catch (error) {
        console.error('Ошибка получения ключей:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Получить значение по ключу
router.get('/admin/cache/value/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const value = await cacheUtils.get(key);
        const exists = await cacheUtils.exists(key);
        
        res.json({
            success: true,
            data: {
                key,
                exists: Boolean(exists),
                value: value
            }
        });
    } catch (error) {
        console.error('Ошибка получения значения:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

// Удалить конкретный ключ
router.delete('/admin/cache/key/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const result = await cacheUtils.del(key);
        
        res.json({
            success: true,
            message: `Ключ ${key} ${result ? 'удален' : 'не найден'}`
        });
    } catch (error) {
        console.error('Ошибка удаления ключа:', error);
        res.status(500).json({
            success: false,
            message: 'Внутренняя ошибка сервера'
        });
    }
});

module.exports = router; 