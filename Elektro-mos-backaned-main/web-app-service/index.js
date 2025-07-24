require('dotenv').config();

const express = require('express'); // Импортируем Express для создания сервера
const cors = require('cors'); // Импортируем CORS для разрешения кросс-доменных запросов
const cron = require('node-cron'); // Импортируем node-cron для планирования задач
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db'); // Импортируем функцию для подключения к базе данных
const { connectRedis, redisClient } = require('./config/redis'); // Импортируем Redis

// Импортируем маршруты
const authRouter = require('./app/auth/authRoutes');
const productRouter = require('./app/products/productRoutes');
const ordersRouter = require('./app/orders/ordersRoutes');
const usersRouter = require('./app/users/userRoutes');
const adminRouter = require('./app/admin/adminRoutes');

const { updateProductData } = require('./cronTasks'); // Импортируем задачу для обновления данных о продуктах

const app = express(); // Создаем экземпляр приложения Express
const PORT = process.env.PORT || 3007; // Устанавливаем порт для сервера

connectDB(); // Подключаемся к базе данных
connectRedis(); // Подключаемся к Redis

// Rate limiting - защита от спама
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: 'Слишком много запросов с этого IP, попробуйте позже.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Session store с Redis
const sessionStore = new RedisStore({
    client: redisClient,
    prefix: 'sess:',
    ttl: 86400 // 24 часа
});

app.use(limiter); // Применяем rate limiting
app.use(express.json()); // Настраиваем middleware для обработки JSON в запросах
app.use(cors()); // Настраиваем CORS

// Настраиваем сессии с Redis
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'elektro-mos-secret-key',
    resave: false,
    saveUninitialized: false,
    name: 'elektro-mos-session',
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS в продакшене
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 // 24 часа
    }
}));

// Настраиваем маршруты с префиксом /api
app.use('/api', authRouter);    
app.use('/api', productRouter);
app.use('/api', ordersRouter);
app.use('/api', usersRouter);
app.use('/api', adminRouter);

// Обработка корневого маршрута
app.get('/', (req, res) => {
    res.send("Основной сервер приложения запущен.");
});

// Запуск сервера на указанном порту
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`http://localhost:${PORT}`);
});

// Планирование задачи обновления данных о продуктах каждые 3 часа
cron.schedule('0 */3 * * *', () => {
    updateProductData();
});

// // Вручную запускаем задачу обновления данных о продуктах
// updateProductData();

module.exports = app; // Экспортируем приложение для использования в других модулях
