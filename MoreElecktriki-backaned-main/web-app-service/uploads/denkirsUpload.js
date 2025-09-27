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

// --- Утилиты для парсинга размеров
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

const getParamValue = (paramObj, synonyms) => {
    for (const key of Object.keys(paramObj)) {
        const lowerKey = key.toLowerCase();
        for (const syn of synonyms) {
            if (lowerKey.includes(syn)) return { value: paramObj[key], header: key };
        }
    }
    return null;
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
            const key = p.$?.name || '';
            const value = p._ || '';
            param[key] = value;
        });
    }

    // Соответствие с твоей схемой
    const socketType = param['тип цоколя'] || '';
    const lampCount = param['количество ламп'] ? parseInt(param['количество ламп']) : 1;
    const shadeColor = param['цвет плафона'] || '';
    const frameColor = param['цвет арматуры'] || '';

    // --- Попробуем получить размеры из param (разные вариации названий)
    const diameterParam = getParamValue(param, ['диаметр', 'ø', 'диам']);
    const heightParam = getParamValue(param, ['высота', 'высота светильника']);
    const depthParam = getParamValue(param, ['глубина', 'глубина светильника']);
    const widthParam = getParamValue(param, ['ширина', 'ширина светильника']);
    const lengthParam = getParamValue(param, ['длина', 'длина светильника']);
    const dimsParam = getParamValue(param, ['габариты', 'размеры', 'размер']);

    const dims = {};
    if (diameterParam) dims.diameter = parseValueWithUnit(diameterParam.value);
    if (heightParam) dims.height = parseValueWithUnit(heightParam.value);
    if (depthParam) dims.depth = parseValueWithUnit(depthParam.value);
    if (widthParam) dims.width = parseValueWithUnit(widthParam.value);
    if (lengthParam) dims.length = parseValueWithUnit(lengthParam.value);
    if (Object.keys(dims).length === 0 && dimsParam) {
        Object.assign(dims, parseDimensionsString(dimsParam.value));
    }

    return Object.assign({
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
    }, dims);
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