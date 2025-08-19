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

            // Изображения
            const imageAddress = Array.isArray(lightData.picture)
                ? lightData.picture.map(img => img.trim())
                : [];

            const productData = {
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
            };

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