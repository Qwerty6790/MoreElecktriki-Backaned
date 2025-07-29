const nodemailer = require('nodemailer');

// Создаем транспортер для отправки email
const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
        user: 'infoelektromosru@gmail.com', // Ваш Gmail
        pass: 'Qwerty670Im' // Пароль от аккаунта
    }
});

// Функция для отправки email
const sendEmail = async (to, subject, text) => {
    try {
        const mailOptions = {
            from: 'infoelektromosru@gmail.com',
            to: to,
            subject: subject,
            text: text
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email отправлен:', info.messageId);
        return true;
    } catch (error) {
        console.error('Ошибка отправки email:', error);
        return false;
    }
};

module.exports = { sendEmail }; 