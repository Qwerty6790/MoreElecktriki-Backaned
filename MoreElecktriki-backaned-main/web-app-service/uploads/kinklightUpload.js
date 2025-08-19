const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const iconv = require('iconv-lite');
const { ProductModel } = require('../app/products/productModel');

// Подключение к MongoDB
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://MoreElektriki:rIK9lXQI8wPnrqri@cluster0moreelecktirki.vacmh0p.mongodb.net/MoreElektriki?retryWrites=true&w=majority&appName=Cluster0MoreElecktirki';
    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Подключено к MongoDB');
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        process.exit(1);
    }
};

// Загрузка товаров KinkLight
const uploadProductsByKinkLight = async () => {
    const url = 'https://kinklight.ru/obmen/yml/unir_full.xml';

    try {
        await connectToDatabase();

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const xmlData = iconv.decode(Buffer.from(response.data), 'windows-1251');

        const result = await xml2js.parseStringPromise(xmlData, { explicitArray: false, trim: true });
        const offers = result.yml_catalog.shop.offers.offer;

        const updatePromises = Array.isArray(offers) ? offers.map(async offer => {
            const price = parseFloat((offer.price || '0').replace(/\s/g, '').replace(',', '.')) || 0;
            const stock = isNaN(parseInt(offer.stock)) ? 0 : parseInt(offer.stock);

            if (price === 0) return; // Пропускаем товары с ценой 0

            // Преобразуем изображения в массив
            const imageAddresses = Array.isArray(offer.picture) ? offer.picture : (offer.picture ? [offer.picture] : []);

            // Собираем данные строго по твоей схеме
            const productData = {
                article: offer.vendorCode || '',
                name: offer.name || '',
                price,
                stock,
                imageAddress: imageAddresses,
                source: 'KinkLight',
                socketType: offer.socket || '',            // Тип цоколя
                lampCount: offer.bulbsquantity ? parseInt(offer.bulbsquantity) : 1, // Количество ламп
                shadeColor: offer.color || '',             // Цвет плафона
                frameColor: offer.color_pokr || '',        // Цвет арматуры
            };

            await ProductModel.findOneAndUpdate(
                { article: productData.article },
                productData,
                { upsert: true, new: true }
            );

            console.log(`Обновлен товар: ${productData.article}`);
        }) : [];

        await Promise.all(updatePromises);
        console.log('Обновление товаров завершено.');
        mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');

    } catch (error) {
        console.error('Ошибка при получении или парсинге XML:', error.message);
    }
};

uploadProductsByKinkLight();

module.exports = { uploadProductsByKinkLight };