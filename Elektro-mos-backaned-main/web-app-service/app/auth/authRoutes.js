const express = require('express');
const router = express.Router();
const authController = require('./authControllers');

// Регистрация пользователя
router.post('/register', authController.register);

// Вход пользователя
router.post('/login', authController.login);

// Запрос на сброс пароля
router.post('/reset-password', authController.resetPassword);

// Сброс пароля по токену
router.post('/reset-password/:resetToken', authController.resetPasswordWithToken);

module.exports = router;
