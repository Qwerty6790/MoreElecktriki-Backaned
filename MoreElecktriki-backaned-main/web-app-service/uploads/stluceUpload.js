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

                const productData = {
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
                };

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