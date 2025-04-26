const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

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

const checkImageExists = async (url) => {
    try {
        await axios.head(url);
        return true;
    } catch (error) {
        return false;
    }
};

const uploadProductsByFavouriteLight = async () => {
    const productUrl = "https://ftp.favourite-light.com/ForClients/export/import.xml";
    const offerUrl = "https://ftp.favourite-light.com/ForClients/export/offers.xml";

    try {
        await connectToDatabase();
        
        const productResponse = await axios.get(productUrl);
        const productXmlData = productResponse.data;
        const productResult = await xml2js.parseStringPromise(productXmlData);
        const products = productResult.Данные.Номенклатура;

        const offerResponse = await axios.get(offerUrl);
        const offerXmlData = offerResponse.data;
        const offerResult = await xml2js.parseStringPromise(offerXmlData);
        const offerElements = offerResult.Данные.Номенклатура;

        const updatePromises = products.map(async (lightData) => {
            const offer = offerElements.find(o => o.$.Имя === lightData.$.Имя);
            const article = lightData.$.Имя;

            // Предполагаем, что ссылки на изображения находятся в поле lightData.СсылкиНаФото
            const imageAddresses = lightData.СсылкиНаФото && lightData.СсылкиНаФото[0]
                ? lightData.СсылкиНаФото[0].split(',').map(url => url.trim())
                : [];

            if (imageAddresses.length === 0) {
                console.log(`Нет изображений для артикула: ${article}`);
            }

            const rawStock = offer && offer.Остаток && offer.Остаток[0] ? offer.Остаток[0] : '0';
            const stockQuantity = isNaN(parseInt(rawStock)) ? 0 : parseInt(rawStock);
            const price = offer && offer.ЦенаРРЦ && offer.ЦенаРРЦ[0] ? parseInt(offer.ЦенаРРЦ[0]) || 0 : 0;

            console.log(`Обрабатываем артикул: ${article}, Остаток: ${rawStock} -> ${stockQuantity}, Цена: ${price}, Фото: ${imageAddresses.length}`);

            const productData = {
                article,
                name: lightData.ПолноеНаименование[0],
                price,
                stock: stockQuantity,
                imageAddress: imageAddresses, // Используем полученные URL'ы из XML
                source: 'FavouriteProduct'
            };

            return ProductModel.findOneAndUpdate(
                { article: productData.article },
                productData,
                { upsert: true, new: true }
            );
        });

        await Promise.all(updatePromises);
        console.log('Обновление товаров завершено.');
        mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    } catch (error) {
        console.error('Ошибка загрузки XML:', error.message);
    }
};

uploadProductsByFavouriteLight();
module.exports = { uploadProductsByFavouriteLight };
