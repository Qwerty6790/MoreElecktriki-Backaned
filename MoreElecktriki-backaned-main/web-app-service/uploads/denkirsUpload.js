const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

// Подключение к MongoDB
const connectToDatabase = async () => {
    const mongoUri = 'mongodb+srv://MoreElektriki:rIK9lXQI8wPnrqri@cluster0moreelecktirki.vacmh0p.mongodb.net/MoreElektriki?retryWrites=true&w=majority&appName=Cluster0MoreElecktirki';
    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Успешное подключение к MongoDB');
    } catch (error) {
        console.error('Ошибка подключения к MongoDB: ' + error.message);
        process.exit(1);
    }
};

// Функция для парсинга одного offer
const parseOffer = (offer) => {
    const price = parseFloat(offer.price) || 0;
    const stock = parseInt(offer.stock) || 0;

    if (price === 0) return null; // пропуск товаров с ценой 0

    // Картинки
    let imageAddress = [];
    if (offer.picture) {
        imageAddress = Array.isArray(offer.picture) ? offer.picture : [offer.picture];
    }

    // Основные поля
    const article = offer.vendorCode || '';
    const name = offer.name || '';
    const source = offer.vendor || 'Denkirs';

    // Параметры светильника из <param>
    const param = {};
    if (offer.param) {
        const paramsArray = Array.isArray(offer.param) ? offer.param : [offer.param];
        paramsArray.forEach(p => {
            const key = p.$?.name?.toLowerCase() || '';
            const value = p._ || '';
            param[key] = value;
        });
    }

    // Соответствие с твоей схемой
    const socketType = param['тип цоколя'] || '';
    const lampCount = param['количество ламп'] ? parseInt(param['количество ламп']) : 1;
    const shadeColor = param['цвет плафона'] || '';
    const frameColor = param['цвет арматуры'] || '';

    return {
        article,
        name,
        price,
        stock,
        imageAddress,
        source,
        socketType,
        lampCount,
        shadeColor,
        frameColor,
    };
};

// Функция загрузки и сохранения продуктов
const uploadProductsByDenkirs = async () => {
    const url = 'https://dealer.denkirs.ru/catalog.xml';

    try {
        const response = await axios.get(url);
        const xmlData = response.data;

        xml2js.parseString(xmlData, { explicitArray: false, trim: true }, async (err, result) => {
            if (err) {
                throw new Error('Ошибка разбора XML: ' + err.message);
            }

            const offers = result.yml_catalog.shop.offers.offer;

            if (!offers || !Array.isArray(offers)) {
                console.error('Некорректная структура данных offers.');
                return;
            }

            console.log('Количество продуктов для обновления:', offers.length);

            const products = offers.map(parseOffer).filter(p => p !== null);

            for (const productData of products) {
                try {
                    const updatedProduct = await ProductModel.findOneAndUpdate(
                        { article: productData.article },
                        productData,
                        { upsert: true, new: true }
                    );
                    console.log('Обновлено/создано:', updatedProduct.article);
                } catch (err) {
                    console.error('Ошибка сохранения:', err.message);
                }
            }

            console.log('Обновление данных продуктов завершено успешно.');
        });
    } catch (error) {
        console.error('Ошибка загрузки XML: ' + error.message);
    }
};

// Основная функция запуска
const startApplication = async () => {
    await connectToDatabase();
    await uploadProductsByDenkirs();
};

startApplication();

module.exports = { uploadProductsByDenkirs };