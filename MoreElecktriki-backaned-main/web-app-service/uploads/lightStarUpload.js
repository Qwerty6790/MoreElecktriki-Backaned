const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

// Функция для подключения к MongoDB, возвращает объект подключения
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://MoreElektriki:rIK9lXQI8wPnrqri@cluster0moreelecktirki.vacmh0p.mongodb.net/MoreElektriki?retryWrites=true&w=majority&appName=Cluster0MoreElecktirki';

    try {
        const connection = await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Подключено к MongoDB');
        return connection;
    } catch (error) {
        console.error('Ошибка подключения к MongoDB:', error.message);
        process.exit(1);
    }
};

// Функция для загрузки товаров от LightStar
const uploadProductsByLightStar = async () => {
    const url = 'https://lightstar.ru/today/stock.xml';

    try {
        // Подключаемся к базе данных
        await connectToDatabase();

        const response = await axios.get(url);
        const xmlData = response.data;

        // Используем normalizeTags, чтобы привести имена тегов к нижнему регистру
        xml2js.parseString(
            xmlData,
            { explicitArray: false, trim: true, normalizeTags: true, normalize: true, attrNameProcessors: [] },
            async (err, result) => {
                if (err) {
                    throw new Error('Ошибка парсинга XML: ' + err.message);
                }

                // Предполагаем, что корневой тег называется "таблица" и элементы находятся в поле "element"
                const products = Array.isArray(result.таблица.element)
                    ? result.таблица.element
                    : [result.таблица.element];

                const updatePromises = products.map(lightData => {
                    // Расширенный лог для отладки
                    console.log('Parsed lightData:', lightData);
                    
                    // Детальный лог поля цены для анализа его структуры
                    if (lightData.цены) {
                        console.log('Структура поля цены:', JSON.stringify(lightData.цены, null, 2));
                        
                        // Вывод всех атрибутов, если они существуют
                        if (lightData.цены.$) {
                            console.log('Атрибуты цены:', JSON.stringify(lightData.цены.$, null, 2));
                            console.log('Доступные ключи в атрибутах:', Object.keys(lightData.цены.$));
                        }
                    }

                    // Более надежное извлечение цены
                    let retailPrice = 0;
                    let priceFound = false;
                    
                    // Сначала попытаемся извлечь цену из атрибутов тега "цены"
                    if (lightData.цены && typeof lightData.цены === 'object' && lightData.цены.$) {
                        const priceAttrs = lightData.цены.$;
                        
                        // Перебираем все возможные варианты написания атрибута "Розничная"
                        const possibleKeys = ['розничная', 'Розничная', 'РОЗНИЧНАЯ'];
                        
                        for (const key in priceAttrs) {
                            if (possibleKeys.includes(key) || possibleKeys.some(pk => key.toLowerCase() === pk.toLowerCase())) {
                                retailPrice = parseFloat(priceAttrs[key]);
                                console.log(`Цена извлечена из атрибута ${key}:`, retailPrice);
                                priceFound = true;
                                break;
                            }
                        }
                    }
                    
                    // Если цена не найдена в атрибутах, пробуем другие варианты
                    if (!priceFound) {
                        if (lightData.цены && lightData.цены.$ && lightData.цены.$.розничная) {
                            retailPrice = parseFloat(lightData.цены.$.розничная);
                            console.log('Цена извлечена из цены.$.розничная:', retailPrice);
                        } else if (lightData.цены && lightData.цены.$ && lightData.цены.$.Розничная) {
                            retailPrice = parseFloat(lightData.цены.$.Розничная);
                            console.log('Цена извлечена из цены.$.Розничная:', retailPrice);
                        } else if (lightData.цены && lightData.цены.розничная) {
                            retailPrice = parseFloat(lightData.цены.розничная);
                            console.log('Цена извлечена из цены.розничная:', retailPrice);
                        } else if (lightData.цена) {
                            retailPrice = parseFloat(lightData.цена);
                            console.log('Цена извлечена из цена:', retailPrice);
                        } else if (lightData.розничнаяцена) {
                            retailPrice = parseFloat(lightData.розничнаяцена);
                            console.log('Цена извлечена из розничнаяцена:', retailPrice);
                        } else if (lightData.price) {
                            retailPrice = parseFloat(lightData.price);
                            console.log('Цена извлечена из price:', retailPrice);
                        } else if (lightData.цены && Array.isArray(lightData.цены) && lightData.цены.length > 0) {
                            // Если цены представлены как массив
                            const firstPrice = lightData.цены[0];
                            if (typeof firstPrice === 'object' && firstPrice.розничная) {
                                retailPrice = parseFloat(firstPrice.розничная);
                                console.log('Цена извлечена из массива цен:', retailPrice);
                            } else if (typeof firstPrice === 'string' || typeof firstPrice === 'number') {
                                retailPrice = parseFloat(firstPrice);
                                console.log('Цена извлечена из первого элемента массива цен:', retailPrice);
                            }
                        } else {
                            // Поиск цены в любом поле, которое содержит "цена" в своем имени
                            for (const key in lightData) {
                                if (key.toLowerCase().includes('цена') || key.toLowerCase().includes('price')) {
                                    retailPrice = parseFloat(lightData[key]);
                                    console.log(`Цена извлечена из поля ${key}:`, retailPrice);
                                    break;
                                }
                            }
                            
                            if (retailPrice === 0) {
                                console.log('Не удалось найти цену в данном товаре');
                            }
                        }
                    }
                    
                    // Проверка на NaN и отрицательные значения
                    if (isNaN(retailPrice) || retailPrice < 0) {
                        retailPrice = 0;
                        console.log('Цена была некорректной, установлена в 0');
                    }
                    
                    const stock = lightData.остаток
                        ? parseInt(lightData.остаток) || 0
                        : 0;

                    // Нормализация поля изображения
                    let imageAddress = [];
                    const imageField = lightData['адрескартинки'];
                    if (imageField) {
                        imageAddress = Array.isArray(imageField) ? imageField : [imageField];
                    }

                    const productData = {
                        article: lightData.артикул || '',
                        name: lightData.наименование || '',
                        price: isNaN(retailPrice) ? 0 : retailPrice,
                        stock,
                        imageAddress, // Используем поле imageAddress из схемы
                        source: 'LightStar'
                    };

                    // Пропускаем товары без обязательных полей (артикул и название)
                    if (!productData.article || !productData.name) {
                        console.warn('Пропущен товар с некорректными данными:', productData);
                        return Promise.resolve();
                    }

                    return ProductModel.findOneAndUpdate(
                        { article: productData.article },
                        productData,
                        { upsert: true, new: true }
                    );
                });

                try {
                    await Promise.all(updatePromises);
                    console.log('Обновление товаров завершено.');
                } catch (saveError) {
                    console.error('Ошибка обновления в БД:', saveError.message);
                }
            }
        );
    } catch (error) {
        console.error('Ошибка при получении XML:', error.message);
    }
};

// Запускаем функцию загрузки товаров
uploadProductsByLightStar();

module.exports = { uploadProductsByLightStar, connectToDatabase };