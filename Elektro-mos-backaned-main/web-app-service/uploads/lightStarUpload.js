const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

// Функция для подключения к MongoDB, возвращает объект подключения
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';

    try {
        const connection = await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Подключено к MongoDB');
        return connection;
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        process.exit(1);
    }
};

// Функция для загрузки товаров от LightStar
const uploadProductsByLightStar = async () => {
    const url = 'https://lightstar.ru/today/stock.xml';

    try {
        // Подключаемся к базе данных
        await connectToDatabase();

        const response = await axios.get(url);
        const xmlData = response.data;

        // Используем normalizeTags, чтобы привести имена тегов к нижнему регистру
        xml2js.parseString(
            xmlData,
            { explicitArray: false, trim: true, normalizeTags: true },
            async (err, result) => {
                if (err) {
                    throw new Error('Ошибка парсинга XML: ' + err.message);
                }

                // Предполагаем, что корневой тег называется "таблица" и элементы находятся в поле "element"
                const products = Array.isArray(result.таблица.element)
                    ? result.таблица.element
                    : [result.таблица.element];

                const updatePromises = products.map(lightData => {
                    // Лог для отладки
                    console.log('Parsed lightData:', lightData);

                    // Извлечение цены и остатка
                    const retailPrice = lightData.цены?.$?.розничная
                        ? parseFloat(lightData.цены.$.розничная)
                        : 0;
                    const stock = lightData.остаток
                        ? parseInt(lightData.остаток) || 0
                        : 0;

                    // Нормализация поля изображения
                    let imageAddress = [];
                    const imageField = lightData['адрескартинки'];
                    if (imageField) {
                        imageAddress = Array.isArray(imageField) ? imageField : [imageField];
                    }

                    const productData = {
                        article: lightData.артикул || '',
                        name: lightData.наименование || '',
                        price: isNaN(retailPrice) ? 0 : retailPrice,
                        stock,
                        imageAddress, // Используем поле imageAddress из схемы
                        source: 'LightStarProduct'
                    };

                    // Пропускаем товары без обязательных полей (артикул и название)
                    if (!productData.article || !productData.name) {
                        console.warn('Пропущен товар с некорректными данными:', productData);
                        return Promise.resolve();
                    }

                    return ProductModel.findOneAndUpdate(
                        { article: productData.article },
                        productData,
                        { upsert: true, new: true }
                    );
                });

                try {
                    await Promise.all(updatePromises);
                    console.log('Обновление товаров завершено.');
                } catch (saveError) {
                    console.error('Ошибка обновления в БД:', saveError.message);
                }
            }
        );
    } catch (error) {
        console.error('Ошибка при получении XML:', error.message);
    }
};

// Запускаем функцию загрузки товаров
uploadProductsByLightStar();

module.exports = { uploadProductsByLightStar, connectToDatabase };
