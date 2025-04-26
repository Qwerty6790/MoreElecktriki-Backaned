const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your-secret-key'; // Вынесите в конфигурацию

const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1]; // Получение токена из заголовка

    if (!token) {
        return res.status(401).json({ message: 'Нет токена, доступ запрещен' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Добавляем информацию о пользователе в req
        next(); // Переход к следующему middleware или контроллеру
    } catch (error) {
        res.status(403).json({ message: 'Токен недействителен' });
    }
};

module.exports = authenticate;
