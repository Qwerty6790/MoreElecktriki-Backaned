const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');
const iconv = require('iconv-lite'); // Подключаем iconv для декодирования

// Функция для подключения к MongoDB
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';

    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Подключено к MongoDB');
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        process.exit(1);
    }
};

// Функция для загрузки товаров от KinkLight
const uploadProductsByKinkLight = async () => {
    const url = 'https://kinklight.ru/obmen/yml/unir_full.xml';

    try {
        await connectToDatabase(); // Подключаемся к базе данных

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const xmlData = iconv.decode(Buffer.from(response.data), 'windows-1251');

        xml2js.parseString(xmlData, { explicitArray: false, trim: true }, async (err, result) => {
            if (err) {
                throw new Error('Ошибка парсинга XML: ' + err.message);
            }

            const offers = result.yml_catalog.shop.offers.offer;

            const updatePromises = Array.isArray(offers) ? offers.map(offer => {
                const price = parseFloat((offer.price || '0').replace(/\s/g, '').replace(',', '.')) || 0;
                const stock = isNaN(parseInt(offer.stock)) ? 0 : parseInt(offer.stock);
                const productName = (offer.name || '').trim();

                // Пропускаем товары с ценой 0
                if (price === 0) {
                    return Promise.resolve();
                }

                // Обработка изображений как массива
                const imageUrls = Array.isArray(offer.picture) ? offer.picture : (offer.picture ? [offer.picture] : []);

                const productData = {
                    article: offer.vendorCode || '',
                    name: productName,
                    price: price,
                    stock: stock,
                    imageAddress: [
                        ...imageUrls, // Изображения как массив
                        ...imageUrls.length === 0 ? [offer.picture] : [] // Если нет изображений в массиве, добавляем строку с изображением
                    ],
                    source: 'KinkLightProduct'
                };

                return ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );
            }) : [];

            try {
                await Promise.all(updatePromises);
                console.log('Обновление товаров завершено.');
            } catch (saveError) {
                console.error('Ошибка обновления в БД:', saveError.message);
            } finally {
                mongoose.connection.close();
                console.log('Соединение с MongoDB закрыто.');
            }
        });
    } catch (error) {
        console.error('Ошибка при получении XML:', error.message);
    }
};

// Запускаем функцию
uploadProductsByKinkLight();

module.exports = { uploadProductsByKinkLight };
