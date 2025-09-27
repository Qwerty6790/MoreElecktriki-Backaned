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

// --- Утилиты парсинга размеров
const parseValueWithUnit = (raw) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const s = String(raw).trim();
    const numMatch = s.match(/[-+]?[0-9]*[.,]?[0-9]+/g);
    if (!numMatch) return null;
    let num = parseFloat(numMatch[0].replace(',', '.'));
    const lower = s.toLowerCase();
    if (lower.includes('см') || lower.includes('cm')) num = num * 10;
    if ((lower.includes('м') || lower.includes('m')) && !lower.includes('мм') && !lower.includes('mm') && !lower.includes('см')) num = num * 1000;
    return num;
};

const getFieldValue = (obj, keys) => {
    for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') {
            const raw = Array.isArray(obj[k]) ? obj[k][0] : obj[k];
            return { value: raw, header: k };
        }
    }
    return null;
};

const parseDimensionsString = (raw) => {
    if (!raw) return {};
    const s = String(raw).replace(/\s+/g, ' ').trim();
    // попробуем собрать числа
    const matches = s.match(/[-+]?[0-9]*[.,]?[0-9]+/g) || [];
    const nums = matches.map(n => parseFloat(n.replace(',', '.'))).map(n => n);
    if (nums.length === 0) return {};
    if (nums.length === 1) return { length: nums[0] };
    if (nums.length === 2) return { length: nums[0], width: nums[1] };
    if (nums.length >= 3) return { length: nums[0], width: nums[1], height: nums[2] };
    return {};
};

const parseNumericFromRaw = (raw, header) => {
    if (raw === undefined || raw === null || raw === '') return null;
    // если заголовок содержит 'см' — вероятно значения в см
    if (header && /см|cm/i.test(header)) {
        const n = parseFloat(String(raw).replace(',', '.'));
        if (Number.isFinite(n)) return n * 10;
    }
    return parseValueWithUnit(raw);
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

            // Попробуем получить размеры: столбцы могут называться по-разному
            const heightField = getFieldValue(lightData, ['Высота', 'Высота светильника см']);
            const lengthField = getFieldValue(lightData, ['Длина', 'Длина светильника см']);
            const widthField = getFieldValue(lightData, ['Ширина', 'Ширина светильника см']);
            const diameterField = getFieldValue(lightData, ['Диаметр', 'Диаметр светильника см']);
            const dimsField = getFieldValue(lightData, ['Габариты', 'Размеры', 'Размер']);

            const dims = {};
            if (heightField) dims.height = parseNumericFromRaw(heightField.value, heightField.header);
            if (lengthField) dims.length = parseNumericFromRaw(lengthField.value, lengthField.header);
            if (widthField) dims.width = parseNumericFromRaw(widthField.value, widthField.header);
            if (diameterField) dims.diameter = parseNumericFromRaw(diameterField.value, diameterField.header);
            if (Object.keys(dims).length === 0 && dimsField) Object.assign(dims, parseDimensionsString(dimsField.value));

            const productData = Object.assign({
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
            }, dims);

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