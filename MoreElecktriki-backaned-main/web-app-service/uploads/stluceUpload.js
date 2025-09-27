const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const iconv = require('iconv-lite');
const { ProductModel } = require('../app/products/productModel');

// Функция для подключения к MongoDB
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

// Функция для парсинга XML
const parseXML = async (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, { explicitArray: false, trim: true }, (err, result) => {
            if (err) {
                reject('Ошибка парсинга XML: ' + err);
            } else {
                resolve(result);
            }
        });
    });
};

// Функция для извлечения значения параметра по имени
const getParamValue = (params, paramName) => {
    if (!params || !Array.isArray(params)) return '';
    
    const param = params.find(p => p.$.name === paramName);
    return param ? (param._ || '').toString().trim() : '';
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

const getFieldValue = (obj, keys) => {
    for (const actualKey of Object.keys(obj)) {
        for (const k of keys) {
            if (actualKey === k || actualKey.toLowerCase() === k.toLowerCase()) {
                const raw = obj[actualKey];
                return { value: Array.isArray(raw) ? raw[0] : raw, header: actualKey };
            }
        }
    }
    return null;
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

const parseNumericFromRaw = (raw, header) => {
    if (raw === undefined || raw === null || raw === '') return null;
    if (header && /см|cm/i.test(header)) {
        const n = parseFloat(String(raw).replace(',', '.'));
        if (Number.isFinite(n)) return n * 10;
    }
    return parseValueWithUnit(raw);
};

// Загрузка и обработка продуктов из XML
const uploadProductsByStluce = async () => {
    await connectToDatabase();

    const url = 'https://stluce.ru/upload/1c/stluce_mrc.xml';
    
    try {
        console.log('Загружаем XML данные...');
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const xmlData = iconv.decode(response.data, 'windows-1251');
        const result = await parseXML(xmlData);

        // Проверяем структуру данных
        if (!result?.yml_catalog?.shop?.offers?.offer) {
            console.error('Offers not found in XML data.');
            console.log('Available structure:', JSON.stringify(result, null, 2).substring(0, 500));
            return;
        }

        let offers = result.yml_catalog.shop.offers.offer;
        
        // Если offer не массив, превращаем в массив
        if (!Array.isArray(offers)) {
            offers = [offers];
        }

        console.log(`Найдено ${offers.length} товаров для обработки`);

        let processedCount = 0;
        let errorCount = 0;

        for (const lightData of offers) {
            try {
                // Извлекаем изображения - может быть строкой или массивом
                let images = [];
                if (lightData.picture) {
                    if (Array.isArray(lightData.picture)) {
                        images = lightData.picture.map(img => img.trim());
                    } else {
                        images = [lightData.picture.trim()];
                    }
                }

                // Извлекаем параметры из массива param
                const params = lightData.param || [];
                const lampCount = getParamValue(params, 'Количество ламп');
                const socketType = getParamValue(params, 'Тип цоколя');
                const frameColor = getParamValue(params, 'Цвет каркаса');
                const shadeColor = getParamValue(params, 'Цвет плафона');

                // Попробуем извлечь размеры из params (разные вариации ключей)
                const diameterParam = getParamFromParams(params, ['диаметр', 'ø', 'диам']);
                const heightParam = getParamFromParams(params, ['высота', 'высота светильника', 'height']);
                const depthParam = getParamFromParams(params, ['глубина', 'глубина светильника', 'depth']);
                const widthParam = getParamFromParams(params, ['ширина', 'ширина светильника', 'width']);
                const lengthParam = getParamFromParams(params, ['длина', 'длина светильника', 'length']);
                const dimsParam = getParamFromParams(params, ['габариты', 'размеры', 'размер', 'size']);

                const dims = {};
                if (diameterParam) dims.diameter = parseValueWithUnit(diameterParam);
                if (heightParam) dims.height = parseValueWithUnit(heightParam);
                if (depthParam) dims.depth = parseValueWithUnit(depthParam);
                if (widthParam) dims.width = parseValueWithUnit(widthParam);
                if (lengthParam) dims.length = parseValueWithUnit(lengthParam);
                if (Object.keys(dims).length === 0 && dimsParam) Object.assign(dims, parseDimensionsString(dimsParam));

                const productData = Object.assign({
                    article: lightData.model || '',
                    name: lightData.name || '',
                    price: parseFloat(lightData.price) || 0,
                    stock: parseInt(lightData.stock) || 0,
                    imageAddress: images,
                    source: 'Stluce',
                    
                    // Новые поля для светильников
                    socketType: socketType,
                    lampCount: parseInt(lampCount) || 1,
                    shadeColor: shadeColor,
                    frameColor: frameColor,
                }, dims);

                // Проверяем обязательные поля
                if (!productData.article || !productData.name) {
                    console.warn(`Пропускаем товар из-за отсутствующих обязательных полей. Артикул: ${productData.article}, Название: ${productData.name}`);
                    errorCount++;
                    continue;
                }

                // Обновляем или создаем товар в базе данных
                await ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );

                processedCount++;
                console.log(`✓ Товар ${productData.article} (${productData.name}) успешно обработан`);
                
                // Логируем подробности для первых 3 товаров
                if (processedCount <= 3) {
                    console.log(`  - Цена: ${productData.price}`);
                    console.log(`  - Остаток: ${productData.stock}`);
                    console.log(`  - Изображений: ${images.length}`);
                    console.log(`  - Тип цоколя: ${productData.socketType}`);
                    console.log(`  - Количество ламп: ${productData.lampCount}`);
                    console.log(`  - Цвет каркаса: ${productData.frameColor}`);
                    console.log(`  - Цвет плафона: ${productData.shadeColor}`);
                }

            } catch (err) {
                console.error(`Ошибка при обработке товара ${lightData.model || 'неизвестный'}:`, err.message);
                errorCount++;
            }
        }

        console.log(`\n=== Результаты обработки ===`);
        console.log(`Всего товаров: ${offers.length}`);
        console.log(`Успешно обработано: ${processedCount}`);
        console.log(`Ошибок: ${errorCount}`);

    } catch (error) {
        console.error('Ошибка при загрузке или парсинге XML данных:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    }
};

uploadProductsByStluce();

module.exports = { uploadProductsByStluce };