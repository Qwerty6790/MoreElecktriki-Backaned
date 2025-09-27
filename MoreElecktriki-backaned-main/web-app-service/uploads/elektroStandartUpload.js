const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel'); // Подключаем твою модель

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
    // если есть указание единиц в строке, parseValueWithUnit внутри вызова будет учитывать
    const matches = s.match(/[-+]?[0-9]*[.,]?[0-9]+/g) || [];
    const nums = matches.map(n => parseFloat(n.replace(',', '.'))).map(n => n);
    if (nums.length === 0) return {};
    if (nums.length === 1) return { length: nums[0] };
    if (nums.length === 2) return { length: nums[0], width: nums[1] };
    if (nums.length >= 3) return { length: nums[0], width: nums[1], height: nums[2] };
    return {};
};

// Функция загрузки и парсинга товаров ElektroStandard
const uploadProductsByElektroStandard = async () => {
    const url = 'https://partners.elektrostandard.ru/prices/prices-elektrostandard-rur.yml';

    try {
        const response = await axios.get(url);
        const xmlData = response.data;

        xml2js.parseString(xmlData, { explicitArray: false, trim: true }, async (err, result) => {
            if (err) throw new Error('Ошибка разбора XML: ' + err.message);

            const offers = result.yml_catalog.shop.offers.offer;

            if (!offers || !Array.isArray(offers)) {
                console.error('Массив offers отсутствует или некорректен.');
                return;
            }

            console.log('Количество товаров для обработки:', offers.length);

            const updatePromises = offers.map((offer) => {
                const price = parseFloat(offer.price) || 0;
                const stock = parseInt(offer.stock) || 0;

                if (!offer.vendorCode) return Promise.resolve(); // Пропускаем товары без артикула

                // Преобразуем картинки в массив
                const imageAddress = Array.isArray(offer.picture) ? offer.picture : offer.picture ? [offer.picture] : [];

                // Достаем параметры из param
                const params = {};
                if (offer.param) {
                    const paramArray = Array.isArray(offer.param) ? offer.param : [offer.param];
                    paramArray.forEach(p => {
                        params[p.$.name] = p._ || '';
                    });
                }

                // Попробуем разобрать размеры из params
                const diameterParam = getParamValue(params, ['диаметр', 'ø', 'диам']);
                const heightParam = getParamValue(params, ['высота', 'высота светильника']);
                const depthParam = getParamValue(params, ['глубина', 'глубина светильника']);
                const widthParam = getParamValue(params, ['ширина', 'ширина светильника']);
                const lengthParam = getParamValue(params, ['длина', 'длина светильника']);
                const dimsParam = getParamValue(params, ['габариты', 'размеры', 'размер']);

                const dims = {};
                if (diameterParam) dims.diameter = parseValueWithUnit(diameterParam.value);
                if (heightParam) dims.height = parseValueWithUnit(heightParam.value);
                if (depthParam) dims.depth = parseValueWithUnit(depthParam.value);
                if (widthParam) dims.width = parseValueWithUnit(widthParam.value);
                if (lengthParam) dims.length = parseValueWithUnit(lengthParam.value);
                if (Object.keys(dims).length === 0 && dimsParam) {
                    Object.assign(dims, parseDimensionsString(dimsParam.value));
                }

                const productData = Object.assign({
                    article: offer.vendorCode,
                    name: offer.name || '',
                    price: price,
                    stock: stock,
                    imageAddress: imageAddress,
                    source: 'ElektroStandard',
                    socketType: params['тип цоколя'] || '',
                    lampCount: parseInt(params['количество ламп']) || 1,
                    shadeColor: params['цвет плафона'] || '',
                    frameColor: params['цвет арматуры'] || '',
                }, dims);

                return ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                ).then((updatedProduct) => {
                    console.log('Обновлено/создано:', updatedProduct.article);
                }).catch(err => {
                    console.error('Ошибка сохранения:', err.message);
                });
            });

            await Promise.all(updatePromises);
            console.log('Обновление данных продуктов завершено.');
        });
    } catch (error) {
        console.error('Ошибка загрузки XML:', error.message);
    }
};

// Запуск
const startApplication = async () => {
    await connectToDatabase();
    await uploadProductsByElektroStandard();
};

startApplication();