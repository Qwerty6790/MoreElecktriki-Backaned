const express = require('express');
const router = express.Router();
const productController = require('./productControllers');
const multer = require('multer');
const { cacheMiddlewares, cacheInvalidators } = require('../../middleware/cacheMiddleware');

const upload = multer();

// Конкретные маршруты (без параметров в пути) размещаем сначала
router.get('/products/search', cacheMiddlewares.quick, productController.searchProductsByName);
// Новый маршрут для поиска похожих товаров
router.get('/products/similar', cacheMiddlewares.products, productController.getSimilarProducts);

// Маршруты с параметрами разместим после конкретных маршрутов
router.get('/products/:supplier', cacheMiddlewares.catalog, productController.getProducts);
router.get('/product/:supplier', cacheMiddlewares.products, productController.getProductByArticle);
router.post('/products/list', productController.getProductList);

// Новые маршруты для администрирования товаров (инвалидируют кэш)
router.patch('/products/:id', cacheInvalidators.products, productController.updateProduct);
router.patch('/products/:id/visibility', cacheInvalidators.products, productController.updateProductVisibility);
router.delete('/products/:id', cacheInvalidators.products, productController.deleteProduct);
router.post('/add-product', upload.single('image'), cacheInvalidators.products, productController.createProduct);

module.exports = router;