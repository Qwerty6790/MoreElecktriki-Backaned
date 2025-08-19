const nodemailer = require('nodemailer');

// Создаем транспортер для отправки email
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // true для 465, false для других портов
    auth: {
        user: '',
        pass: '' // Замените на ваш App Password
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Функция для отправки email
const sendEmail = async (to, subject, text) => {
    try {
        console.log('Попытка отправки email на:', to);
        console.log('Тема:', subject);
        
        const mailOptions = {
            from: '',
            to: to,
            subject: subject,
            text: text
        };

        console.log('Настройки email:', mailOptions);

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email успешно отправлен:', info.messageId);
        return true;
    } catch (error) {
        console.error('❌ Ошибка отправки email:', error.message);
        console.error('Детали ошибки:', error);
        return false;
    }
};

module.exports = { sendEmail }; 