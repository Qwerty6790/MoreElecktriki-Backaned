const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
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

// Основной парсинг и обновление товаров
const uploadProductsByFavouriteLight = async () => {
    const productUrl = "https://ftp.favourite-light.com/ForClients/export/import.xml";
    const offerUrl = "https://ftp.favourite-light.com/ForClients/export/offers.xml";

    try {
        await connectToDatabase();

        // Получаем XML с товарами
        const productResponse = await axios.get(productUrl);
        const productXmlData = productResponse.data;
        const productResult = await xml2js.parseStringPromise(productXmlData);
        const products = productResult.Данные.Номенклатура;

        // Получаем XML с остатками/ценами
        const offerResponse = await axios.get(offerUrl);
        const offerXmlData = offerResponse.data;
        const offerResult = await xml2js.parseStringPromise(offerXmlData);
        const offerElements = offerResult.Данные.Номенклатура;

        const updatePromises = products.map(async (lightData) => {
            const article = lightData.$.Имя;

            // Ищем соответствующее предложение с ценой и остатком
            const offer = offerElements.find(o => o.$.Имя === article);

            // Преобразуем ссылки на фото в массив
            const imageAddresses = lightData.СсылкиНаФото && lightData.СсылкиНаФото[0]
                ? lightData.СсылкиНаФото[0].split(',').map(url => url.trim())
                : [];

            // Остаток
            const stockQuantity = offer && offer.Остаток && offer.Остаток[0]
                ? parseInt(offer.Остаток[0]) || 0
                : 0;

            // Цена
            const price = offer && offer.ЦенаРРЦ && offer.ЦенаРРЦ[0]
                ? parseFloat(offer.ЦенаРРЦ[0]) || 0
                : 0;

            // Количество ламп
            const lampCount = lightData.КоличествоЛамп && lightData.КоличествоЛамп[0]
                ? parseInt(lightData.КоличествоЛамп[0]) || 1
                : 1;

            // Цоколь
            const socketType = lightData.Цоколь && lightData.Цоколь[0]
                ? lightData.Цоколь[0]
                : '';

            // Цвет плафона
            const shadeColor = lightData.МатериалИЦветПлафона && lightData.МатериалИЦветПлафона[0]
                ? lightData.МатериалИЦветПлафона[0]
                : '';

            // Цвет арматуры
            const frameColor = lightData.ЦветОтделка && lightData.ЦветОтделка[0]
                ? lightData.ЦветОтделка[0]
                : '';

            const productData = {
                article,
                name: lightData.ПолноеНаименование[0] || article,
                price,
                stock: stockQuantity,
                imageAddress: imageAddresses,
                source: 'Favourite',
                socketType,
                lampCount,
                shadeColor,
                frameColor
            };

            return ProductModel.findOneAndUpdate(
                { article: productData.article },
                productData,
                { upsert: true, new: true }
            ).then(() => {
                console.log(`Обновлен артикул: ${article}`);
            }).catch(err => {
                console.error(`Ошибка при сохранении артикула ${article}:`, err.message);
            });
        });

        await Promise.all(updatePromises);
        console.log('Обновление товаров завершено.');
        mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    } catch (error) {
        console.error('Ошибка загрузки или парсинга XML:', error.message);
    }
};

// Запуск
uploadProductsByFavouriteLight();
module.exports = { uploadProductsByFavouriteLight };