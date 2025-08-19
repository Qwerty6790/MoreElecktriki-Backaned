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

                const productData = {
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
                };

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