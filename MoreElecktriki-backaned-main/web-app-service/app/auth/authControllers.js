const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const User = require('../users/userModel');

const JWT_SECRET = 'your-secret-key';
const JWT_EXPIRATION = '30d'; // Время действия токена

// Регистрация пользователя
exports.register = async (req, res) => {
    const { username, email, password } = req.body;

    try {
        // Проверка, что пользователь с таким email еще не существует
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
        }

        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);

        // Создание нового пользователя
        const newUser = new User({ username, email, password: hashedPassword });
        await newUser.save();

        // Генерация JWT
        const token = generateJWT(newUser);

        // Возвращаем токен и имя пользователя в ответе
        res.status(201).json({ token, username }); // Добавили имя пользователя в ответ
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Вход пользователя
exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // Поиск пользователя по email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Проверка пароля
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        // Генерация JWT
        const token = generateJWT(user);

        // Возвращаем токен и имя пользователя в ответе
        res.json({ token, username: user.username }); // Добавили имя пользователя в ответ
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Запрос на сброс пароля
exports.resetPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // Поиск пользователя по email
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        // Генерация токена для сброса пароля
        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetToken = resetToken;
        user.resetTokenExpiration = Date.now() + 3600000; // Токен действителен 1 час
        await user.save();

        // Отправка email с инструкциями по сбросу пароля
        await axios.post('https://palermo-light-backend-emailer.vercel.app/api/send-email', {
            from: 'your-gmail-account@gmail.com',
            to: user.email,
            subject: 'Сброс пароля',
            text: `Здравствуйте! 
        
        Пожалуйста, перейдите по следующей ссылке, чтобы сбросить пароль: 
        https://palermolight.ru/reset-password/${resetToken}
        
        Если вы не запрашивали сброс пароля, просто проигнорируйте это сообщение.
        
        С уважением, 
        Команда Palermo Light.`
        });
        

        res.json({ message: 'Инструкции по сбросу пароля отправлены на вашу электронную почту' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Сброс пароля с помощью токена
exports.resetPasswordWithToken = async (req, res) => {
    const { resetToken } = req.params;
    const { newPassword } = req.body;

    try {
        // Поиск пользователя по токену
        const user = await User.findOne({
            resetToken: resetToken,
            resetTokenExpiration: { $gt: Date.now() }
        });
        if (!user) {
            return res.status(400).json({ error: 'Неверный или истекший токен сброса' });
        }

        // Обновление пароля
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        user.resetToken = null;
        user.resetTokenExpiration = null;
        await user.save();

        res.json({ message: 'Пароль успешно сброшен' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Генерация JWT
function generateJWT(user) {
    return jwt.sign(
        { userId: user._id, username: user.username, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
    );
}
