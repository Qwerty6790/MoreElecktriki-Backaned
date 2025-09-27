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

const parseDimensionsString = (raw) => {
    if (!raw) return {};
    const s = String(raw).replace(/\s+/g, ' ').trim();
    const matches = s.match(/[-+]?[0-9]*[.,]?[0-9]+/g) || [];
    const nums = matches.map(n => parseFloat(n.replace(',', '.'))).map(n => n);
    if (nums.length === 0) return {};
    if (nums.length === 1) return { length: nums[0] };
    if (nums.length === 2) return { length: nums[0], width: nums[1] };
    if (nums.length >= 3) return { length: nums[0], width: nums[1], height: nums[2] };
    return {};
};

const getParamValue = (offerObj, keys) => {
    for (const k of keys) {
        if (offerObj[k] !== undefined && offerObj[k] !== null && offerObj[k] !== '') {
            return offerObj[k];
        }
    }
    return null;
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
            // Попробуем извлечь размеры
            const diameterRaw = getParamValue(offer, ['diameter', 'диаметр', 'Ø']);
            const heightRaw = getParamValue(offer, ['height', 'высота', 'height_cm']);
            const widthRaw = getParamValue(offer, ['width', 'ширина']);
            const lengthRaw = getParamValue(offer, ['length', 'длина']);
            const dimsRaw = getParamValue(offer, ['dimensions', 'габариты', 'size']);

            const dims = {};
            if (diameterRaw) dims.diameter = parseValueWithUnit(diameterRaw);
            if (heightRaw) dims.height = parseValueWithUnit(heightRaw);
            if (widthRaw) dims.width = parseValueWithUnit(widthRaw);
            if (lengthRaw) dims.length = parseValueWithUnit(lengthRaw);
            if (Object.keys(dims).length === 0 && dimsRaw) Object.assign(dims, parseDimensionsString(dimsRaw));

            const productData = Object.assign({
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
            }, dims);

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