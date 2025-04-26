const express = require('express');
const ordersController = require('./ordersControllers');
const authenticate = require('../auth/authMiddleware');
const router = express.Router();

// Добавление заказа с онлайн платежом
router.post('/orders/add-order-with-payment', authenticate, ordersController.addOrderWithPayment);

// Добавление заказа без онлайн-платежа
router.post('/orders/add-order-without-payment', authenticate, ordersController.addOrderWithoutPayment);

// Обработка webhook от ЮKassa
router.post('/orders/payment-notification', authenticate, ordersController.handlePaymentNotification);

// Остальные маршруты (получение заказов, обновление и т.д.)
router.get('/orders', authenticate, ordersController.getUserOrders);
router.delete('/orders/:orderId', authenticate, ordersController.deleteOrder);
router.patch('/orders/:orderId/products/:article/status', ordersController.updateProductInOrderStatus);
router.patch('/orders/:orderId/status', ordersController.updateOrderStatus);
router.get('/orders/:orderId', authenticate, ordersController.getOrderById);
router.get('/all-orders', ordersController.getAllOrders);

module.exports = router;
