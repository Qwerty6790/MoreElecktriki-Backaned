const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

const connectToDatabase = async () => {
    const mongoUri = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';

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

const uploadProductsByElektroStandard = async () => {
    const url = 'https://partners.elektrostandard.ru/prices/prices-elektrostandard-rur.yml';

    try {
        const response = await axios.get(url);
        const xmlData = response.data;

        xml2js.parseString(xmlData, { explicitArray: false, trim: true }, async (err, result) => {
            if (err) {
                throw new Error('Ошибка разбора XML: ' + err.message);
            }

            const offers = result.yml_catalog.shop.offers.offer;
            console.log('Структура данных offers:', offers);

            if (!offers || !Array.isArray(offers)) {
                console.error('Массив offers отсутствует или некорректен.');
                return;
            }

            const updatePromises = offers.map((offer) => {
                const price = parseFloat(offer.price) || 0;
                const stock = parseInt(offer.stock) || 0;

                if (price === 0) {
                    return Promise.resolve();
                }

                // Получаем изображения
                let imageAddress = Array.isArray(offer.picture) ? offer.picture : offer.picture ? [offer.picture] : [];

                // Добавляем дополнительную фотографию
                const additionalImage = "https://example.com/new-image.jpg";  // Замените на ваш URL изображения
                imageAddress.push(additionalImage);  // Добавление новой фотографии

                const productData = {
                    article: offer.vendorCode || '',
                    name: offer.name || '',
                    price: price,
                    stock: stock,
                    imageAddress,
                    source: 'ElektroStandardProduct',
                };

                console.log('Данные для сохранения:', productData);

                if (!productData.article) {
                    console.error('Пропущен продукт с отсутствующим артикулом:', offer);
                    return Promise.resolve();
                }

                return ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                )
                    .then((updatedProduct) => {
                        console.log('Обновлено/создано:', updatedProduct);
                    })
                    .catch((err) => {
                        console.error('Ошибка сохранения:', err.message);
                    });
            });

            await Promise.all(updatePromises);
            console.log('Обновление данных продуктов завершено успешно.');
        });
    } catch (error) {
        console.error('Ошибка загрузки XML: ' + error.message);
    }
};


const startApplication = async () => {
    await connectToDatabase();
    await uploadProductsByElektroStandard();
};

startApplication();
