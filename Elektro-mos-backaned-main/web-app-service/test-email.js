const { sendEmail } = require('./utils/emailService');

async function testEmail() {
    console.log('🧪 Тестируем отправку email...');
    
    try {
        const result = await sendEmail(
            'papinyan27@gmail.com',
            'Тест email - ЭлектроМОС',
            'Это тестовое сообщение для проверки работы email сервиса.'
        );
        
        if (result) {
            console.log('✅ Тест email успешно отправлен!');
        } else {
            console.log('❌ Тест email не отправлен');
        }
    } catch (error) {
        console.error('❌ Ошибка тестирования email:', error);
    }
}

testEmail(); 