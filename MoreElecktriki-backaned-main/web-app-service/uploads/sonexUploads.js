const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

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

// Функция для получения значения свойства по имени
const getPropertyValue = (properties, propertyName) => {
  if (!properties || !properties.property) return '';
  
  const property = properties.property.find(p => p.$.name === propertyName);
  return property ? property.$.value : '';
};

// Функция для получения массива изображений
const getImages = (itemData) => {
  let images = [];
  
  // Сначала пытаемся получить из поля picture
  if (itemData.picture && itemData.picture.length) {
    images = itemData.picture.map(img => img.trim()).filter(img => img);
  }
  
  // Если нет, то ищем в свойствах
  if (images.length === 0 && itemData.properties && itemData.properties[0]) {
    const properties = itemData.properties[0];
    
    // Основное фото
    const mainPhoto = getPropertyValue(properties, "Фото на сайте");
    if (mainPhoto && mainPhoto !== '-') {
      images.push(mainPhoto);
    }
    
    // Дополнительные фото
    const additionalPhoto = getPropertyValue(properties, "Ссылка на фото_доп ракурс");
    if (additionalPhoto && additionalPhoto !== '-') {
      images.push(additionalPhoto);
    }
    
    const whiteBackgroundPhoto = getPropertyValue(properties, "Ссылка на фото на белом фоне_вкл");
    if (whiteBackgroundPhoto && whiteBackgroundPhoto !== '-') {
      images.push(whiteBackgroundPhoto);
    }
    
    const colorBackgroundPhoto = getPropertyValue(properties, "Ссылка на фото на цветном фоне_вкл");
    if (colorBackgroundPhoto && colorBackgroundPhoto !== '-') {
      images.push(colorBackgroundPhoto);
    }
    
    const schemaPhoto = getPropertyValue(properties, "Ссылка на схему товара");
    if (schemaPhoto && schemaPhoto !== '-') {
      images.push(schemaPhoto);
    }
  }
  
  // Удаляем дубликаты
  return [...new Set(images)];
};

// Функция для безопасного парсинга числа
const safeParseFloat = (value, defaultValue = 0) => {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
};

const safeParseInt = (value, defaultValue = 0) => {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const uploadProductsBySonex = async () => {
  await connectToDatabase();

  const productsURL = 'https://isonex.ru/upload/catalog_files/sonex.xml';
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

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const itemData of products) {
    try {
      const code = itemData.code?.[0] || '';
      const article = itemData.article?.[0] || '';
      const name = itemData.name?.[0] || '';
      
      if (!name || !article) {
        console.warn(`Пропуск товара – отсутствует название или артикул (код: ${code}).`);
        skipCount++;
        continue;
      }

      const images = getImages(itemData);
      const properties = itemData.properties?.[0];

      const productData = {
        article: article,
        code: code,
        name: name,
        price: safeParseFloat(itemData.price?.[0]),
        stock: stockMap[code] !== undefined ? stockMap[code] : safeParseInt(itemData.stock?.[0]),
        imageAddress: images,
        source: 'Sonex',
        visible: true, // По умолчанию товар видим
        
        // Новые поля для светильников
        socketType: properties ? getPropertyValue(properties, "Тип цоколя лампы") || getPropertyValue(properties, "Цоколь") : '',
        lampCount: properties ? safeParseInt(getPropertyValue(properties, "Количество ламп"), 1) : 1,
        shadeColor: properties ? getPropertyValue(properties, "Цвет плафона") : '',
        frameColor: properties ? getPropertyValue(properties, "Цвет арматуры") : ''
      };

      // Дополнительная обработка данных
      if (productData.socketType === '-' || productData.socketType === '') {
        productData.socketType = 'LED'; // По умолчанию для LED светильников
      }

      if (productData.shadeColor === '-') productData.shadeColor = '';
      if (productData.frameColor === '-') productData.frameColor = '';

      await ProductModel.findOneAndUpdate(
        { article: productData.article },
        productData,
        { upsert: true, new: true }
      );
      
      console.log(`✓ Товар "${productData.name}" (артикул: ${productData.article}, код: ${code}) успешно обновлен/создан.`);
      console.log(`  - Цена: ${productData.price} руб.`);
      console.log(`  - Остаток: ${productData.stock} шт.`);
      console.log(`  - Изображений: ${productData.imageAddress.length}`);
      console.log(`  - Цоколь: ${productData.socketType}`);
      console.log(`  - Количество ламп: ${productData.lampCount}`);
      console.log(`  - Цвет плафона: ${productData.shadeColor}`);
      console.log(`  - Цвет арматуры: ${productData.frameColor}\n`);
      
      successCount++;
    } catch (err) {
      console.error(`✗ Ошибка при обновлении товара "${itemData.name?.[0] || 'Unknown'}":`, err.message);
      errorCount++;
    }
  }

  console.log('\n=== РЕЗУЛЬТАТЫ ПАРСИНГА ===');
  console.log(`Успешно обработано: ${successCount} товаров`);
  console.log(`Пропущено: ${skipCount} товаров`);
  console.log(`Ошибок: ${errorCount} товаров`);
  console.log(`Всего товаров в XML: ${products.length}`);

  mongoose.connection.close();
  console.log('Соединение с MongoDB закрыто.');
};

uploadProductsBySonex().catch(console.error);

module.exports = { uploadProductsBySonex };