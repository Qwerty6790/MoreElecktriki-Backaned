const express = require('express');
const router = express.Router();
const productController = require('./productControllers');
const multer = require('multer');

const upload = multer();

// Конкретные маршруты (без параметров в пути) размещаем сначала
router.get('/products/search', productController.searchProductsByName);
// Новый маршрут для поиска похожих товаров
router.get('/products/similar', productController.getSimilarProducts);

// Маршруты с параметрами разместим после конкретных маршрутов
router.get('/products/:supplier', productController.getProducts);
router.get('/product/:supplier', productController.getProductByArticle);
router.post('/products/list', productController.getProductList);

// Новые маршруты для администрирования товаров
router.patch('/products/:id', productController.updateProduct);
router.patch('/products/:id/visibility', productController.updateProductVisibility);
router.delete('/products/:id', productController.deleteProduct);
router.post('/add-product', upload.single('image'), productController.createProduct);

module.exports = router;