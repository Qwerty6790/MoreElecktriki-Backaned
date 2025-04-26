const axios = require('axios');
const xml2js = require('xml2js');
const mongoose = require('mongoose');
const { ProductModel } = require('../app/products/productModel');

const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';

const connectToDatabase = async () => {
    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1);
    }
};

const uploadProductsByWerkel = async () => {
    const url = 'https://werkel.ru/prices/prices-werkel-rur.yml';

    try {
        const response = await axios.get(url);
        const xmlData = response.data;

        xml2js.parseString(xmlData, { explicitArray: false, trim: true }, async (err, result) => {
            if (err) {
                throw new Error('XML parsing error: ' + err.message);
            }

            const offers = result.yml_catalog.shop.offers.offer;

            const updatePromises = Array.isArray(offers) ? offers.map(offer => {
                const price = parseFloat(offer.price) || 0;
                const stock = parseInt(offer.stock) || 0;

                if (price === 0) {
                    return Promise.resolve(); // Skip if price is 0
                }

                // Проверяем, является ли offer.picture массивом и корректно обрабатываем его
                const imageAddresses = offer.picture
                    ? (Array.isArray(offer.picture) ? offer.picture.map(url => url.trim()) : [offer.picture.trim()])
                    : [];

                // Логирование для отладки
                console.log(`Артикул: ${offer.vendorCode}, Изображения: ${imageAddresses}`);

                if (imageAddresses.length === 0) {
                    console.log(`Нет изображений для артикула: ${offer.vendorCode}`);
                }

                const productData = {
                    article: offer.vendorCode || '',
                    name: offer.name || '',
                    price: price,
                    stock: stock,
                    imageAddress: imageAddresses.length > 0 ? imageAddresses[0] : '', // Используем строку вместо массива
                    source: 'WerkelProduct'
                };

                return ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );
            }) : [];
            
            try {
                await Promise.all(updatePromises);
                console.log('Products successfully updated.');
            } catch (saveError) {
                console.error('Ошибка обновления в БД: ' + saveError.message);
            } finally {
                await mongoose.connection.close();
                console.log('MongoDB connection closed.');
            }
        });
    } catch (error) {
        console.error('Ошибка при получении XML: ' + error.message);
    }
};

const main = async () => {
    await connectToDatabase();
    await uploadProductsByWerkel();
};

main();

module.exports = { uploadProductsByWerkel };
