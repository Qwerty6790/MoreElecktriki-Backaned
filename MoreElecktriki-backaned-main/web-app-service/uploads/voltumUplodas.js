const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const iconv = require('iconv-lite');
const { ProductModel } = require('../app/products/productModel');

// Подключение к MongoDB
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

// Функция парсинга XML
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

// Загрузка и обработка продуктов из локального XML файла Voltum
const uploadProductsByVoltum = async () => {
  await connectToDatabase();
  
  // Формирование абсолютного пути к файлу (например, yml/voltum.yml)
  const filePath = path.join(__dirname, 'yml', 'voltum.yml');
  
  try {
    const fileData = await fs.promises.readFile(filePath);
    // Если XML в другой кодировке (например, windows-1251), измените 'utf-8' на нужную
    const xmlData = iconv.decode(fileData, 'utf-8');
    const result = await parseXML(xmlData);
    
    // Для отладки: вывод полной структуры XML (при необходимости закомментируйте)
    console.log("XML Structure:", JSON.stringify(result, null, 2));
    
    // Извлечение офферов; если структура отличается – скорректируйте путь
    const offers = result?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer;
    if (!offers || !Array.isArray(offers)) {
      console.error('Offers not found или неверный формат XML данных.');
      return;
    }
    
    for (const offer of offers) {
      // Извлечение артикула: сначала vendorCode, иначе используем атрибут id
      let article = '';
      if (offer.vendorCode && offer.vendorCode[0]) {
        article = offer.vendorCode[0].trim();
      } else if (offer.$ && offer.$.id) {
        article = offer.$.id.trim();
      }
      
      // Извлечение названия
      const name = offer.name && offer.name[0] ? offer.name[0].trim() : '';
      
      // Парсинг цены и количества
      const price = offer.price && offer.price[0] ? parseFloat(offer.price[0].trim()) : 0;
      const stock = offer.stock && offer.stock[0] ? parseInt(offer.stock[0].trim()) : 0;
      
      // Извлечение изображений
      let images = [];
      if (offer.picture && Array.isArray(offer.picture)) {
        images = offer.picture.map(pic => pic.trim()).filter(url => url.length > 0);
      }
      if (images.length === 0) {
        images.push("https://voltum.ru/default-image.jpg");
      }
      
      const productData = {
        article,
        name,
        price,
        stock,
        imageAddress: images,
        source: 'VoltumProduct'
      };
      
      // Проверка обязательных полей
      if (!article || !name) {
        console.warn(`Пропуск продукта из-за отсутствия обязательных полей. article: "${article}", name: "${name}"`);
        continue;
      }
      
      try {
        await ProductModel.findOneAndUpdate(
          { article: productData.article },
          productData,
          { upsert: true, new: true }
        );
        console.log(`Продукт с артикулом ${productData.article} успешно обновлён или создан.`);
      } catch (err) {
        console.error(`Ошибка обновления продукта с артикулом ${productData.article}:`, err);
      }
    }
    
    console.log('Все продукты успешно обновлены или созданы.');
  } catch (error) {
    console.error('Ошибка получения или парсинга XML данных: ' + error.message);
  } finally {
    await mongoose.connection.close();
    console.log('Соединение с MongoDB закрыто.');
  }
};

uploadProductsByVoltum();

module.exports = { uploadProductsByVoltum };
