const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const iconv = require('iconv-lite');
const { ProductModel } = require('../app/products/productModel');

// Функция для подключения к MongoDB
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';
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
        xml2js.parseString(xml, { explicitArray: true, trim: true }, (err, result) => {
            if (err) {
                reject('Ошибка парсинга XML: ' + err);
            } else {
                resolve(result);
            }
        });
    });
};

// Загрузка и обработка продуктов из XML
const uploadProductsByStluce = async () => {
    await connectToDatabase(); // Подключаемся к базе данных

    const url = 'https://stluce.ru/upload/1c/stluce_mrc.xml';
    
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const xmlData = iconv.decode(response.data, 'windows-1251');
        const result = await parseXML(xmlData);

        if (!result?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer) {
            console.error('Offers not found in XML data.');
            return;
        }

        const products = result.yml_catalog.shop[0].offers[0].offer;

        for (const lightData of products) {
            const images = lightData.picture ? lightData.picture.map(img => img.trim()) : [];

            // Add a new image URL (string) to the image array
            const additionalImage = "https://example.com/new-image.jpg"; // Replace with your image URL
            images.push(additionalImage); // Add the new image URL to the array

            const productData = {
                article: lightData.model?.[0] || '',
                name: lightData.name?.[0] || '',
                price: parseFloat(lightData.price?.[0]) || 0,
                stock: parseInt(lightData.stock?.[0]) || 0,
                imageAddress: images, // Store all image URLs in an array
                source: 'StluceProduct',
            };

            if (!productData.article || !productData.name) {
                console.warn(`Skipping product due to missing required fields: ${productData.article}`);
                continue;
            }

            try {
                await ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );
                console.log(`Product with article ${productData.article} updated successfully.`);
            } catch (err) {
                console.error(`Error updating product with article ${productData.article}:`, err);
            }
        }

        console.log('All products successfully updated or created.');
    } catch (error) {
        console.error('Error fetching or parsing XML data: ' + error.message);
    } finally {
        mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    }
};

uploadProductsByStluce();

module.exports = { uploadProductsByStluce };
