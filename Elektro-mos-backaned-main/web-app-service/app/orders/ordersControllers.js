const { OrderModel } = require('./orderModel'); // Импорт модели заказа
const User = require('../users/userModel'); // Импорт модели пользователя
const { sendEmail } = require('../../utils/emailService'); // Импортируем функцию отправки email
const YooKassa  = require('yookassa'); // Импортируем библиотеку YooKassa

// Настройки для ЮKassa
const yooKassa = new YooKassa({
    shopId: '1108942', // Укажите ваш shopId
    secretKey: 'test_DXi-fT28EEr4xza_ghdwpaX0UcP1bH__vdEn3PkzRwI' // Укажите ваш secretKey
});

// Функция для создания заказа и начала оплаты
exports.addOrderWithPayment = async (req, res) => {
    console.log('🚀 Вызвана функция addOrderWithPayment');
    console.log('📦 Товары:', req.body.products);
    console.log('👤 Пользователь ID:', req.user.userId);
    
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

        // Получаем данные пользователя для отправки email
        const user = await User.findById(userId);
        
        // Отправляем уведомление на почту администратора
        console.log('📧 Отправляем email уведомление администратору...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Новый заказ с онлайн оплатой',
                `Получен новый заказ с онлайн оплатой!

ID заказа: ${order._id}
Сумма: ${totalAmount} руб.
Статус: ${order.status}

Пользователь: ${user ? user.username : 'Неизвестный пользователь'}
Email: ${user ? user.email : 'Не указан'}
ID пользователя: ${req.user.userId}

Товары:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Ссылка на оплату: ${payment.confirmation.confirmation_url}`
            );
            console.log('✅ Email администратору отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору:', emailError);
        }

        // Отправляем уведомление клиенту
        if (user && user.email) {
            console.log('📧 Отправляем email уведомление клиенту...');
            try {
                const clientEmailResult = await sendEmail(
                    user.email,
                    'Ваш заказ создан - перейдите к оплате - ЭлектроМОС',
                    `Здравствуйте, ${user.username}!

Ваш заказ успешно создан!

Номер заказа: ${order._id}
Сумма заказа: ${totalAmount} руб.
Способ оплаты: Онлайн оплата
Статус: Ожидает оплаты

Товары в заказе:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Для завершения заказа перейдите по ссылке для оплаты:
${payment.confirmation.confirmation_url}

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
                );
                console.log('✅ Email клиенту отправлен:', clientEmailResult);
            } catch (emailError) {
                console.error('❌ Ошибка отправки email клиенту:', emailError);
            }
        } else {
            console.log('⚠️ Email клиенту не отправлен - email не указан');
        }

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

    console.log('💰 Обработка webhook оплаты для заказа:', orderId);
    console.log('👤 Пользователь ID:', userId);

    try {
        const order = await OrderModel.findById(orderId);

        if (!order) {
            console.error('❌ Заказ не найден:', orderId);
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        // Обновляем статус заказа после успешной оплаты
        order.status = 'Оплачен';
        await order.save();
        console.log('✅ Статус заказа обновлен на "Оплачен"');

        // Уведомляем пользователя о подтверждении оплаты
        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ Пользователь не найден:', userId);
            return res.status(404).json({ message: 'Пользователь не найден' });
        }

        // Отправляем email уведомление администратору
        console.log('📧 Отправляем email уведомление администратору об оплате...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Заказ оплачен - ЭлектроМОС',
                `Заказ успешно оплачен!

ID заказа: ${order._id}
Сумма: ${order.totalAmount} руб.
Статус: Оплачен

Пользователь: ${user.username}
Email: ${user.email}

Товары:
${order.products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Время оплаты: ${new Date().toLocaleString('ru-RU')}`
            );
            console.log('✅ Email администратору об оплате отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору об оплате:', emailError);
        }

        // Отправляем email уведомление клиенту
        console.log('📧 Отправляем email уведомление клиенту об оплате...');
        try {
            const clientEmailResult = await sendEmail(
                user.email,
                'Ваш заказ оплачен - ЭлектроМОС',
                `Здравствуйте, ${user.username}!

Ваш заказ успешно оплачен!

Номер заказа: ${order._id}
Сумма заказа: ${order.totalAmount} руб.
Статус: Оплачен
Время оплаты: ${new Date().toLocaleString('ru-RU')}

Товары в заказе:
${order.products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Мы начнем обработку вашего заказа в ближайшее время.

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
            );
            console.log('✅ Email клиенту об оплате отправлен:', clientEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email клиенту об оплате:', emailError);
        }

        res.status(200).json({ message: 'Статус заказа обновлён на "оплачен"' });
    } catch (error) {
        console.error('❌ Ошибка обработки webhook:', error);
        res.status(500).json({ message: 'Ошибка при обработке запроса' });
    }
} 

// Функция для создания заказа с оплатой на месте
exports.addOrderWithoutPayment = async (req, res) => {
    console.log('🚀 Вызвана функция addOrderWithoutPayment');
    console.log('📦 Товары:', req.body.products);
    console.log('👤 Пользователь ID:', req.user.userId);
    console.log('📧 Email уведомления будут отправлены после создания заказа');
    
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

        // Получаем данные пользователя для отправки email
        const user = await User.findById(userId);
        
        // Отправляем уведомление на почту администратора
        console.log('📧 Отправляем email уведомление администратору...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Новый заказ с оплатой при получении',
                `Получен новый заказ с оплатой при получении!

ID заказа: ${order._id}
Сумма: ${totalAmount} руб.
Статус: ${order.status}

Пользователь: ${user ? user.username : 'Неизвестный пользователь'}
Email: ${user ? user.email : 'Не указан'}
ID пользователя: ${req.user.userId}

Товары:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}`
            );
            console.log('✅ Email администратору отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору:', emailError);
        }

        // Отправляем уведомление клиенту
        if (user && user.email) {
            console.log('📧 Отправляем email уведомление клиенту...');
            try {
                const clientEmailResult = await sendEmail(
                    user.email,
                    'Ваш заказ успешно создан - ЭлектроМОС',
                    `Здравствуйте, ${user.username}!

Ваш заказ успешно создан!

Номер заказа: ${order._id}
Сумма заказа: ${totalAmount} руб.
Способ оплаты: Оплата при получении
Статус: Ожидает обработки

Товары в заказе:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Мы свяжемся с вами в ближайшее время для подтверждения заказа.

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
                );
                console.log('✅ Email клиенту отправлен:', clientEmailResult);
            } catch (emailError) {
                console.error('❌ Ошибка отправки email клиенту:', emailError);
            }
        } else {
            console.log('⚠️ Email клиенту не отправлен - email не указан');
        }

        console.log('✅ Заказ успешно создан и email уведомления отправлены');
        res.status(201).json({ message: 'Заказ создан', order });
    } catch (error) {
        console.error('❌ Ошибка создания заказа:', error);
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

// ==================== ГОСТЕВЫЕ ЗАКАЗЫ БЕЗ АВТОРИЗАЦИИ ====================

// Функция для создания гостевого заказа с онлайн оплатой
exports.addGuestOrderWithPayment = async (req, res) => {
    console.log('🚀 Вызвана функция addGuestOrderWithPayment');
    console.log('📦 Товары:', req.body.products);
    console.log('👤 Гость:', req.body.guestInfo);
    
    const { products, guestInfo } = req.body;

    // Валидация данных гостя
    if (!guestInfo || !guestInfo.name || !guestInfo.surname || !guestInfo.phone || !guestInfo.email) {
        return res.status(400).json({ 
            message: 'Требуется указать имя, фамилию, телефон и email гостя' 
        });
    }

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Недействительный список товаров' });
    }

    // Проверяем, что каждый товар имеет необходимые поля
    for (const product of products) {
        if (!product.name || product.price == null) {
            return res.status(400).json({ 
                message: 'Каждый товар должен содержать имя и цену' 
            });
        }
    }

    // Рассчитываем общую сумму заказа
    const totalAmount = products.reduce((total, product) => total + (product.price * product.quantity), 0);

    try {
        // Создаём гостевой заказ в базе данных без userId
        const order = new OrderModel({ 
            products, 
            totalAmount, 
            status: 'pending',
            guestInfo: {
                name: guestInfo.name,
                surname: guestInfo.surname,
                phone: guestInfo.phone,
                email: guestInfo.email,
                comment: guestInfo.comment || '',
                address: guestInfo.address || ''
            },
            isGuest: true
        });
        await order.save();

        // Создаём платёж в ЮKassa
        const payment = await yooKassa.createPayment({
            amount: {
                value: totalAmount.toFixed(2),
                currency: 'RUB',
            },
            confirmation: {
                type: 'redirect',
                return_url: `https://elektromos.ru/payment-success/${order._id}`
            },
            capture: true,
            description: `Оплата заказа #${order._id} (Гость: ${guestInfo.name})`,
            metadata: {
                orderId: order._id.toString(),
                isGuest: 'true'
            }
        });

        // Отправляем уведомление на почту администратора
        console.log('📧 Отправляем email уведомление администратору...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Новый гостевой заказ с онлайн оплатой',
                `Получен новый гостевой заказ с онлайн оплатой!

ID заказа: ${order._id}
Сумма: ${totalAmount} руб.
Статус: ${order.status}

Гость: ${guestInfo.name} ${guestInfo.surname}
Email: ${guestInfo.email}
Телефон: ${guestInfo.phone}
Адрес: ${guestInfo.address || 'Не указан'}
Комментарий: ${guestInfo.comment || 'Нет'}

Товары:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Ссылка на оплату: ${payment.confirmation.confirmation_url}`
            );
            console.log('✅ Email администратору отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору:', emailError);
        }

        // Отправляем уведомление клиенту
        console.log('📧 Отправляем email уведомление клиенту...');
        try {
            const clientEmailResult = await sendEmail(
                guestInfo.email,
                'Ваш заказ создан - перейдите к оплате - ЭлектроМОС',
                `Здравствуйте, ${guestInfo.name}!

Ваш заказ успешно создан!

Номер заказа: ${order._id}
Сумма заказа: ${totalAmount} руб.
Способ оплаты: Онлайн оплата
Статус: Ожидает оплаты

Товары в заказе:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Для завершения заказа перейдите по ссылке для оплаты:
${payment.confirmation.confirmation_url}

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
            );
            console.log('✅ Email клиенту отправлен:', clientEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email клиенту:', emailError);
        }

        res.status(201).json({
            message: 'Гостевой заказ создан. Перейдите по ссылке для оплаты.',
            order,
            paymentUrl: payment.confirmation.confirmation_url
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для создания гостевого заказа без онлайн оплаты (оплата при получении)
exports.addGuestOrderWithoutPayment = async (req, res) => {
    console.log('🚀 Вызвана функция addGuestOrderWithoutPayment');
    console.log('📦 Товары:', req.body.products);
    console.log('👤 Гость:', req.body.guestInfo);
    console.log('📧 Email уведомления будут отправлены после создания заказа');
    
    const { products, guestInfo } = req.body;

    // Валидация данных гостя
    if (!guestInfo || !guestInfo.name || !guestInfo.surname || !guestInfo.phone || !guestInfo.email) {
        return res.status(400).json({ 
            message: 'Требуется указать имя, фамилию, телефон и email гостя' 
        });
    }

    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Недействительный список товаров' });
    }

    // Проверяем, что каждый товар имеет необходимые поля
    for (const product of products) {
        if (!product.name || product.price == null) {
            return res.status(400).json({ 
                message: 'Каждый товар должен содержать имя и цену' 
            });
        }
    }

    // Рассчитываем общую сумму заказа
    const totalAmount = products.reduce((total, product) => total + (product.price * product.quantity), 0);

    try {
        const order = new OrderModel({ 
            products, 
            totalAmount, 
            status: 'Оплата при получении',
            guestInfo: {
                name: guestInfo.name,
                surname: guestInfo.surname,
                phone: guestInfo.phone,
                email: guestInfo.email,
                comment: guestInfo.comment || '',
                address: guestInfo.address || ''
            },
            isGuest: true
        });
        await order.save();

        // Отправляем уведомление на почту администратора
        console.log('📧 Отправляем email уведомление администратору...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Новый гостевой заказ с оплатой при получении',
                `Получен новый гостевой заказ с оплатой при получении!

ID заказа: ${order._id}
Сумма: ${totalAmount} руб.
Статус: ${order.status}

Гость: ${guestInfo.name} ${guestInfo.surname}
Email: ${guestInfo.email}
Телефон: ${guestInfo.phone}
Адрес: ${guestInfo.address || 'Не указан'}
Комментарий: ${guestInfo.comment || 'Нет'}

Товары:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}`
            );
            console.log('✅ Email администратору отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору:', emailError);
        }

        // Отправляем уведомление клиенту
        console.log('📧 Отправляем email уведомление клиенту...');
        try {
            const clientEmailResult = await sendEmail(
                guestInfo.email,
                'Ваш заказ успешно создан - ЭлектроМОС',
                `Здравствуйте, ${guestInfo.name}!

Ваш заказ успешно создан!

Номер заказа: ${order._id}
Сумма заказа: ${totalAmount} руб.
Способ оплаты: Оплата при получении
Статус: Ожидает обработки

Товары в заказе:
${products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Мы свяжемся с вами в ближайшее время для подтверждения заказа.

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
            );
            console.log('✅ Email клиенту отправлен:', clientEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email клиенту:', emailError);
        }

        console.log('✅ Гостевой заказ успешно создан и email уведомления отправлены');
        res.status(201).json({ 
            message: 'Гостевой заказ создан', 
            order,
            trackingId: order._id
        });
    } catch (error) {
        console.error('❌ Ошибка создания гостевого заказа:', error);
        res.status(500).json({ message: error.message });
    }
};

// Функция для получения информации о гостевом заказе по ID (для отслеживания)
exports.getGuestOrderById = async (req, res) => {
    const { orderId } = req.params;

    try {
        const order = await OrderModel.findOne({ 
            _id: orderId, 
            isGuest: true 
        });

        if (!order) {
            return res.status(404).json({ 
                message: 'Заказ не найден' 
            });
        }

        res.json({ order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Функция для обработки webhook от ЮKassa для гостевых заказов
exports.handleGuestPaymentNotification = async (req, res) => {
    const { orderId } = req.query;

    console.log('💰 Обработка webhook оплаты для гостевого заказа:', orderId);

    try {
        const order = await OrderModel.findById(orderId);

        if (!order) {
            console.error('❌ Гостевой заказ не найден:', orderId);
            return res.status(404).json({ message: 'Заказ не найден' });
        }

        if (!order.isGuest) {
            console.error('❌ Это не гостевой заказ:', orderId);
            return res.status(400).json({ message: 'Это не гостевой заказ' });
        }

        // Обновляем статус заказа после успешной оплаты
        order.status = 'Оплачен';
        await order.save();
        console.log('✅ Статус гостевого заказа обновлен на "Оплачен"');

        // Отправляем email уведомление администратору
        console.log('📧 Отправляем email уведомление администратору об оплате гостевого заказа...');
        try {
            const adminEmailResult = await sendEmail(
                'infoelektromosru@gmail.com',
                'Гостевой заказ оплачен - ЭлектроМОС',
                `Гостевой заказ успешно оплачен!

ID заказа: ${order._id}
Сумма: ${order.totalAmount} руб.
Статус: Оплачен

Гость: ${order.guestInfo.name} ${order.guestInfo.surname}
Email: ${order.guestInfo.email}
Телефон: ${order.guestInfo.phone}
Адрес: ${order.guestInfo.address || 'Не указан'}

Товары:
${order.products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Время оплаты: ${new Date().toLocaleString('ru-RU')}`
            );
            console.log('✅ Email администратору об оплате гостевого заказа отправлен:', adminEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email администратору об оплате гостевого заказа:', emailError);
        }

        // Отправляем email уведомление клиенту
        console.log('📧 Отправляем email уведомление клиенту об оплате...');
        try {
            const clientEmailResult = await sendEmail(
                order.guestInfo.email,
                'Ваш заказ оплачен - ЭлектроМОС',
                `Здравствуйте, ${order.guestInfo.name}!

Ваш заказ успешно оплачен!

Номер заказа: ${order._id}
Сумма заказа: ${order.totalAmount} руб.
Статус: Оплачен
Время оплаты: ${new Date().toLocaleString('ru-RU')}

Товары в заказе:
${order.products.map(p => `- ${p.name} (${p.quantity} шт.) - ${p.price} руб.`).join('\n')}

Мы начнем обработку вашего заказа в ближайшее время.

С уважением,
Команда ЭлектроМОС
Телефон: +7 (495) 123-45-67
Email: infoelektromosru@gmail.com`
            );
            console.log('✅ Email клиенту об оплате отправлен:', clientEmailResult);
        } catch (emailError) {
            console.error('❌ Ошибка отправки email клиенту об оплате:', emailError);
        }

        res.status(200).json({ 
            message: 'Статус гостевого заказа обновлён на "оплачен"' 
        });
    } catch (error) {
        console.error('❌ Ошибка обработки webhook гостевого заказа:', error);
        res.status(500).json({ message: 'Ошибка при обработке запроса' });
    }
};
