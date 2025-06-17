const { OrderModel } = require('./orderModel'); // Импорт модели заказа
const User = require('../users/userModel'); // Импорт модели пользователя
const axios = require('axios'); // Импортируем axios для отправки email
const YooKassa  = require('yookassa'); // Импортируем библиотеку YooKassa

// Настройки для ЮKassa
const yooKassa = new YooKassa({
    shopId: '1108942', // Укажите ваш shopId
    secretKey: 'test_DXi-fT28EEr4xza_ghdwpaX0UcP1bH__vdEn3PkzRwI' // Укажите ваш secretKey
});

// Функция для создания заказа и начала оплаты
exports.addOrderWithPayment = async (req, res) => {
    const { products } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Недействительный список товаров' });
    }

    // Проверяем, что каждый товар имеет необходимые поля
    for (const product of products) {
        if (!product.name || product.price == null) {
            return res.status(400).json({ message: 'Каждый товар должен содержать имя и цену' });
        }
    }

    // Рассчитываем общую сумму заказа
    const totalAmount = products.reduce((total, product) => total + (product.price * product.quantity), 0);

    try {
        // Создаём заказ в базе данных
        const order = new OrderModel({ userId, products, totalAmount, status: 'pending' });
        await order.save();

        // Создаём платёж в ЮKassa
        const payment = await yooKassa.createPayment({
            amount: {
                value: totalAmount.toFixed(2), // Сумма заказа
                currency: 'RUB',
            },
            confirmation: {
                type: 'redirect', // Пользователь будет перенаправлен для оплаты
                return_url: `https://elektromos.ru/payment-success/${order._id}`
            },
            capture: true, // Автоматическое подтверждение платежа
            description: `Оплата заказа #${order._id}`,
            metadata: {
                orderId: order._id.toString(),
            }
        });

        // Возвращаем ссылку на оплату
        res.status(201).json({
            message: 'Заказ создан. Перейдите по ссылке для оплаты.',
            order,
            paymentUrl: payment.confirmation.confirmation_url
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для обработки webhook от ЮKassa
exports.handlePaymentNotification = async (req, res) => {
    const { orderId } = req.query; // Получаем только orderId и status
    const userId = req.user.userId; 

        try {
            const order = await OrderModel.findById(orderId);

            if (!order) {
                return res.status(404).json({ message: 'Заказ не найден' });
            }

            // Обновляем статус заказа после успешной оплаты
            order.status = 'Оплачен';
            await order.save();

            // Уведомляем пользователя о подтверждении оплаты
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ message: 'Пользователь не найден' });
            }

            // await axios.post('https://palermo-light-backend-emailer.vercel.app/api/send-email', {
            //     from: 'your-gmail-account@gmail.com',
            //     to: user.email,
            //     subject: 'Оплата подтверждена',
            //     text: `Здравствуйте, ${user.username}!

            //     Ваш заказ #${orderId} был успешно оплачен. Мы начнём его обработку в ближайшее время.

            //     Если у вас есть вопросы, пожалуйста, свяжитесь с нашей службой поддержки - davidmonte00@mail.ru

            //     С уважением,
            //     Команда Palermo Light.`
            // });

            res.status(200).json({ message: 'Статус заказа обновлён на "оплачен"' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Ошибка при обработке запроса' });
        }
    } 

// Функция для создания заказа с оплатой на месте
exports.addOrderWithoutPayment = async (req, res) => {
    const { products } = req.body;
    const userId = req.user.userId;

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Недействительный список товаров' });
    }

    // Проверяем, что каждый товар имеет необходимые поля
    for (const product of products) {
        if (!product.name || product.price == null) {
            return res.status(400).json({ message: 'Каждый товар должен содержать имя и цену' });
        }
    }

    // Рассчитываем общую сумму заказа
    const totalAmount = products.reduce((total, product) => total + (product.price * product.quantity), 0);

    try {
        const order = new OrderModel({ userId, products, totalAmount, status: 'Оплата при получении' });
        await order.save();
        res.status(201).json({ message: 'Заказ создан', order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для получения заказов пользователя
exports.getUserOrders = async (req, res) => {
    const userId = req.user.userId;

    try {
        const orders = await OrderModel.find({ userId }).sort({ createdAt: -1 });
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для удаления заказа
exports.deleteOrder = async (req, res) => {
    const userId = req.user.userId;
    const { orderId } = req.params;

    try {
        const order = await OrderModel.findOneAndDelete({ _id: orderId, userId });

        if (!order) {
            return res.status(404).json({ message: 'Заказ не найден или не принадлежит пользователю' });
        }

        res.status(200).json({ message: 'Заказ успешно удалён' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для обновления статуса товара в заказе
exports.updateProductInOrderStatus = async (req, res) => {
    const { orderId, article } = req.params;
    const { status } = req.body;

    try {
        const order = await OrderModel.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        // Ищем товар по артикулу
        const product = order.products.find(p => p.article === article);

        if (!product) {
            return res.status(404).json({ message: 'Товар не найден в заказе' });
        }

        // Обновляем статус товара
        product.status = status;
        await order.save();

        // Отправка уведомления по электронной почте
        const user = await User.findById(order.userId);
        await axios.post('https://palermo-light-backend-emailer.vercel.app/api/send-email', {
            from: 'your-gmail-account@gmail.com',
            to: user.email,
            subject: 'Статус товара в заказе изменён',
            text: `Здравствуйте, ${user.username}!

            Статус товара "${product.name}" в вашем заказе #${orderId} был изменён на "${status}". 

            Если у вас есть вопросы, пожалуйста, свяжитесь с нашей службой поддержки - davidmonte00@mail.ru

            С уважением,
            Команда Palermo Light.`
        });

        res.status(200).json({ message: 'Состояние товара успешно изменено', product });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для обновления статуса заказа
exports.updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    try {
        const order = await OrderModel.findById(orderId);

        if (!order) {
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        // Обновляем статус заказа
        order.status = status;
        await order.save();

        // Отправка уведомления по электронной почте
        const user = await User.findById(order.userId);
        await axios.post('https://palermo-light-backend-emailer.vercel.app/api/send-email', {
            from: 'your-gmail-account@gmail.com',
            to: user.email,
            subject: 'Статус заказа изменён',
            text: `Здравствуйте, ${user.username}!

            Статус вашего заказа #${orderId} был изменён на "${status}". 

            Если у вас есть вопросы, пожалуйста, свяжитесь с нашей службой поддержки - davidmonte00@mail.ru

            С уважением,
            Команда Palermo Light.`
        });

        res.status(200).json({ message: 'Состояние заказа успешно изменено' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для получения конкретного заказа по его ID
exports.getOrderById = async (req, res) => {
    const userId = req.user.userId;
    const { orderId } = req.params;

    try {
        const order = await OrderModel.findOne({ _id: orderId, userId });

        if (!order) {
            return res.status(404).json({ message: 'Заказ не найден или не принадлежит пользователю' });
        }

        res.json({ order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Получение всех заказов для админа
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await OrderModel.find().sort({ createdAt: -1 });
        res.json({ orders });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
