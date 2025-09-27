const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

// Подключение к MongoDB
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://MoreElektriki:rIK9lXQI8wPnrqri@cluster0moreelecktirki.vacmh0p.mongodb.net/MoreElektriki?retryWrites=true&w=majority&appName=Cluster0MoreElecktirki';
    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

// Парсинг XML
const parseXML = async (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, { explicitArray: true, trim: true }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

// Безопасное преобразование в число
const parseNumber = (value, defaultValue = 0) => {
    const number = parseFloat(value);
    return isNaN(number) ? defaultValue : number;
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

const getParamFromParams = (params, synonyms) => {
    if (!params || !Array.isArray(params)) return null;
    for (const p of params) {
        const name = (p.$ && p.$.name) ? String(p.$.name).toLowerCase() : '';
        for (const syn of synonyms) {
            if (name.includes(syn)) return p._ || '';
        }
    }
    return null;
};

// Загрузка и обработка товаров Maytoni
const uploadProductsByMaytoni = async () => {
    try {
        const { data: xmlData } = await axios.get('https://mais-upload.maytoni.de/YML/all.yml');
        const result = await parseXML(xmlData);

        const products = result?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer;
        if (!products) {
            console.error('No offers found in XML');
            return;
        }

        for (const lightData of products) {
            const article = lightData.vendorCode?.[0] || '';
            const name = lightData.name?.[0] || '';
            if (!article || !name) continue; // Пропускаем без обязательных полей

            // Цена
            const price = parseNumber(lightData.priceWB?.[0] || lightData.price?.[0], 0);

            // Stock
            const stockParam = lightData.param?.find(param => param.$?.name === 'Остаток');
            const stock = parseNumber(stockParam?._, 0);

            // Цвета, тип цоколя и количество ламп
            const frameColor = lightData.param?.find(param => param.$?.name === 'Цвет')?._ || '';
            const shadeColor = lightData.param?.find(param => param.$?.name === 'Цвет абажура')?._ || '';
            const socketType = lightData.param?.find(param => param.$?.name === 'Цоколь')?._ || '';
            const lampParam = lightData.param?.find(param => param.$?.name === 'Лампы в комплекте');
            const lampCount = parseNumber(lampParam?._, 1);

            // Попробуем получить размеры из param
            const diameterParam = getParamFromParams(lightData.param, ['диаметр', 'ø', 'диам']);
            const heightParam = getParamFromParams(lightData.param, ['высота', 'высота светильника']);
            const depthParam = getParamFromParams(lightData.param, ['глубина', 'глубина светильника']);
            const widthParam = getParamFromParams(lightData.param, ['ширина', 'ширина светильника']);
            const lengthParam = getParamFromParams(lightData.param, ['длина', 'длина светильника']);
            const dimsParam = getParamFromParams(lightData.param, ['габариты', 'размеры', 'размер']);

            const dims = {};
            if (diameterParam) dims.diameter = parseValueWithUnit(diameterParam);
            if (heightParam) dims.height = parseValueWithUnit(heightParam);
            if (depthParam) dims.depth = parseValueWithUnit(depthParam);
            if (widthParam) dims.width = parseValueWithUnit(widthParam);
            if (lengthParam) dims.length = parseValueWithUnit(lengthParam);
            if (Object.keys(dims).length === 0 && dimsParam) Object.assign(dims, parseDimensionsString(dimsParam));

            // Изображения
            const imageAddress = Array.isArray(lightData.picture)
                ? lightData.picture.map(img => img.trim())
                : [];

            const productData = Object.assign({
                article,
                name,
                price,
                stock,
                source: 'Maytoni',
                frameColor,
                shadeColor,
                socketType,
                lampCount,
                imageAddress
            }, dims);

            try {
                await ProductModel.findOneAndUpdate(
                    { article },
                    { $set: productData },
                    { upsert: true, new: true }
                );
                console.log(`Updated product: ${article}`);
            } catch (err) {
                console.error(`Error updating ${article}:`, err.message);
            }
        }

    } catch (error) {
        console.error('Error fetching XML:', error.message);
    }
};

// Основная функция
const main = async () => {
    await connectToDatabase();
    await uploadProductsByMaytoni();
    mongoose.connection.close();
    console.log('MongoDB connection closed.');
};

main();

module.exports = { uploadProductsByMaytoni };