const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

const connectToDatabase = async () => {
  const mongoURI = 'mongodb+srv://MoreElektriki:rIK9lXQI8wPnrqri@cluster0moreelecktirki.vacmh0p.mongodb.net/MoreElektriki?retryWrites=true&w=majority&appName=Cluster0MoreElecktirki';
  try {
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Подключено к MongoDB');
  } catch (error) {
    console.error('Ошибка подключения к MongoDB:', error.message);
    process.exit(1);
  }
};

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

// Получение данных из XML по URL
const fetchXMLData = async (url) => {
  try {
    const response = await axios.get(url, { responseType: 'text' });
    return await parseXML(response.data);
  } catch (error) {
    console.error(`Ошибка загрузки XML (${url}):`, error.message);
    return null;
  }
};

// Загрузка остатков
const loadStockData = async () => {
  const stockURL = 'https://isonex.ru/upload/stocks.xml';
  const stockData = await fetchXMLData(stockURL);
  
  if (!stockData || !stockData.data || !stockData.data.items || !stockData.data.items[0].item) {
    console.error('Остатки не найдены в XML stock.');
    return {};
  }

  let stockItems = stockData.data.items[0].item;
  if (!Array.isArray(stockItems)) {
    stockItems = [stockItems];
  }

  const stockMap = {};
  stockItems.forEach(item => {
    if (item.code && item.code[0] && item.stock && item.stock[0]) {
      stockMap[item.code[0]] = parseInt(item.stock[0], 10) || 0;
    }
  });

  return stockMap;
};

// Функция для получения массива изображений
const getImages = (itemData) => {
  let images = [];
  
  if (itemData.picture && itemData.picture.length) {
    images = itemData.picture.map(img => img.trim());
  } else if (itemData.properties && itemData.properties[0] && itemData.properties[0].property) {
    images = itemData.properties[0].property
      .filter(p => p.$.name === "Фото на сайте")
      .map(p => p.$.value);
  }
  
  return images.length ? images : [];
};

// Функция для извлечения значения свойства
const getPropertyValue = (properties, propertyName) => {
  if (!properties || !properties[0] || !properties[0].property) {
    return '';
  }
  
  const property = properties[0].property.find(p => p.$.name === propertyName);
  return property ? property.$.value || '' : '';
};

const uploadProductsByNovotechLight = async () => {
  await connectToDatabase();
  
  const productsURL = 'https://isonex.ru/upload/catalog_files/novotech.xml';
  const result = await fetchXMLData(productsURL);
  const stockMap = await loadStockData();

  if (!result || !result.data || !result.data.catalog || !result.data.catalog[0].items || !result.data.catalog[0].items[0].item) {
    console.error('Товары не найдены в XML data.');
    return;
  }

  let products = result.data.catalog[0].items[0].item;
  if (!Array.isArray(products)) {
    products = [products];
  }

  for (const itemData of products) {
    const code = itemData.code?.[0] || '';
    const images = getImages(itemData);

    const productData = {
      article: itemData.article?.[0] || '',
      code: code,
      name: itemData.name?.[0] || '',
      price: parseFloat(itemData.price?.[0]) || 0,
      stock: stockMap[code] !== undefined ? stockMap[code] : parseInt(itemData.stock?.[0]) || 0,
      imageAddress: images,
      source: 'NovotechLight',
      visible: true, // По умолчанию товар видимый
      
      // Новые поля из схемы
      socketType: getPropertyValue(itemData.properties, 'Тип цоколя лампы') || 
                  getPropertyValue(itemData.properties, 'Цоколь') || '',
      
      lampCount: parseInt(getPropertyValue(itemData.properties, 'Количество ламп')) || 1,
      
      shadeColor: getPropertyValue(itemData.properties, 'Цвет плафона') || '',
      
      frameColor: getPropertyValue(itemData.properties, 'Цвет арматуры') || 
                  getPropertyValue(itemData.properties, 'Цвет арматуры для КТ') || 
                  getPropertyValue(itemData.properties, 'Цвет') || ''
    };

    if (!productData.name || !productData.article) {
      console.warn(`Пропуск товара – отсутствует название или артикул (код: ${code}).`);
      continue;
    }

    try {
      await ProductModel.findOneAndUpdate(
        { article: productData.article },
        productData,
        { upsert: true, new: true }
      );
      
      console.log(`Товар "${productData.name}" (артикул: ${productData.article}, код: ${code}) успешно обновлен/создан.`);
      console.log(`  Цоколь: ${productData.socketType}`);
      console.log(`  Количество ламп: ${productData.lampCount}`);
      console.log(`  Цвет плафона: ${productData.shadeColor}`);
      console.log(`  Цвет арматуры: ${productData.frameColor}`);
      
    } catch (err) {
      console.error(`Ошибка при обновлении товара "${productData.name}":`, err);
    }
  }

  console.log('Все товары успешно обновлены или созданы.');
  mongoose.connection.close();
  console.log('Соединение с MongoDB закрыто.');
};

uploadProductsByNovotechLight();

module.exports = { uploadProductsByNovotechLight };