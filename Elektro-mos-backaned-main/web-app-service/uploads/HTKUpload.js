const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ProductModel } = require('../app/products/productModel');

// Путь к файлу Excel
let EXCEL_FILE_PATH = path.join(__dirname, '../Uploads/yml/ЧТКteplypol.xls');

// Список целевых названий товаров
const targetNames = [
    'МНД',
    'Снт-18',
    'Сн-15',
    'Сн-10',
    'Снгт',
    'Ст-18',
    'Терморегулятор',
    'Сн-28',
    'Снв'
];

// Обязательные товары (обрабатываются даже при отсутствии некоторых данных)
const mandatoryNames = ['Мнд-160', 'Мнф-150'];

// Connect to MongoDB
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

// Parse the XLSX file and convert it to JSON
const parseXLSXFile = (filePath) => {
    try {
        console.log(`Чтение файла: ${filePath}`);
        
        // Проверяем существование директории, если нет - создаем
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
            console.log(`Директория ${dirPath} не существует, создаем...`);
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Директория ${dirPath} успешно создана`);
        }
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`Файл не найден: ${filePath}`);
        }
        
        // Чтение файла и создание рабочей книги
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        console.log(`Лист Excel: ${sheetName}`);
        
        // Преобразование данных в JSON
        const data = xlsx.utils.sheet_to_json(worksheet);
        console.log(`Прочитано ${data.length} строк из Excel`);
        
        return data;
    } catch (error) {
        console.error('Ошибка при обработке XLS/XLSX файла:', error.message);
        throw error;
    }
};

// Определяем возможные имена колонок для разных типов данных
const possibleColumnNames = {
    article: ['Артикул', 'Артикул поставщика', 'Код товара', 'vendorCode', 'id', 'код', 'Код', 'Code', 'артикул', 'Индекс'],
    name: ['Наименование', 'Наименование для сайта', 'Название', 'name', 'Товар', 'Модель', 'Описание', 'Title', 'Product Name', 'Товары'],
    price: ['Розничные цены', 'Розничная цена', 'Цена', 'РРЦ', 'Price', 'Стоимость', 'Цена опт', 'price', 'Прайс', 'руб', 'Рекомендуемая цена', 'Розница'],
    stock: ['ПартнерЦена', 'Партнер', 'Партнерская цена', 'Свободный остаток', 'Остаток', 'Свободный остаток (Регион)', 'InStock', 'Stock', 'Количество', 'Доступно', 'Наличие', 'В наличии', 'остаток'],
    images: ['Ссылка на изображение', 'Изображение', 'Изображения', 'Фото', 'picture', 'image', 'images', 'Картинка', 'URL изображения', 'Изображение товара', 'Картинки', 'фото', 'Pic', 'Picture']
};

// Приоритеты для колонок с ценами (от наиболее важной к наименее важной)
const pricePriority = [
    'Розничные цены',
    'Розничная цена',
    'Цена розничная',
    'Цена',
    'РРЦ',
    'Рекомендуемая цена',
    'Price',
    'Стоимость',
    'Цена опт',
    'price'
];

// Улучшенная функция для определения колонок
function determineColumns(products) {
    if (!products || products.length === 0) {
        return {
            article: [], name: [], price: [], stock: [], images: []
        };
    }

    const columnTypes = {
        article: [],
        name: [],
        price: [],
        stock: [],
        images: []
    };

    const firstRow = products[0];
    
    console.log('Анализ колонок в файле:');
    
    for (const key of Object.keys(firstRow)) {
        for (const priceColName of pricePriority) {
            if (key.toLowerCase() === priceColName.toLowerCase() || 
                key.toLowerCase().includes(priceColName.toLowerCase())) {
                columnTypes.price.push(key);
                console.log(`  ✓ Найдена приоритетная колонка с ценой: "${key}"`);
                break;
            }
        }
    }
    
    for (const key of Object.keys(firstRow)) {
        console.log(`- Найдена колонка: "${key}"`);
        
        let matched = false;
        for (const [type, possibleNames] of Object.entries(possibleColumnNames)) {
            if (type === 'price' && columnTypes.price.includes(key)) {
                matched = true;
                break;
            }
            
            if (possibleNames.some(name => {
                return key.toLowerCase().includes(name.toLowerCase()) || 
                       name.toLowerCase().includes(key.toLowerCase());
            })) {
                columnTypes[type].push(key);
                console.log(`  → Определена как колонка типа "${type}"`);
                matched = true;
                break;
            }
        }
        
        if (!matched && firstRow[key] !== undefined) {
            const value = String(firstRow[key]);
            
            if (/^\d+([.,]\d+)?(\s*р)?$/i.test(value)) {
                columnTypes.price.push(key);
                console.log(`  → Определена как колонка цены по формату значения: "${value}"`);
            } else if (/^\d+$/.test(value)) {
                columnTypes.stock.push(key);
                console.log(`  → Определена как колонка остатка по формату значения: "${value}"`);
            } else if (value.length > 30 && /http/i.test(value)) {
                columnTypes.images.push(key);
                console.log(`  → Определена как колонка с изображениями по формату значения`);
            }
        }
    }

    return columnTypes;
}

// Upload products from Excel file and update MongoDB
const uploadProductsFromExcel = async () => {
    try {
        console.log(`Обработка файла: ${EXCEL_FILE_PATH}`);
        
        // Парсинг Excel-файла
        const products = parseXLSXFile(EXCEL_FILE_PATH);
        
        // Если данные не найдены или массив пуст
        if (!products || products.length === 0) {
            console.error('В файле Excel не найдены данные товаров');
            return;
        }
        
        // Выведем первую строку полностью для анализа
        console.log('Первая строка данных:', JSON.stringify(products[0], null, 2));
        
        // Тут выведем заголовки колонок для отладки
        console.log('Доступные колонки:');
        Object.keys(products[0]).forEach(key => {
            console.log(`- ${key}`);
        });
        
        // Используем улучшенную функцию определения колонок
        const columnTypes = determineColumns(products);

        console.log('Определенные типы колонок:');
        for (const [type, columns] of Object.entries(columnTypes)) {
            console.log(`- ${type}: ${columns.join(', ') || 'не найдены'}`);
        }
        
        // Сортируем колонки цен по приоритету
        if (columnTypes.price.length > 1) {
            columnTypes.price.sort((a, b) => {
                const aIndex = pricePriority.findIndex(p => 
                    a.toLowerCase().includes(p.toLowerCase()) || 
                    p.toLowerCase().includes(a.toLowerCase())
                );
                const bIndex = pricePriority.findIndex(p => 
                    b.toLowerCase().includes(p.toLowerCase()) || 
                    p.toLowerCase().includes(b.toLowerCase())
                );
                
                const aValue = aIndex === -1 ? 999 : aIndex;
                const bValue = bIndex === -1 ? 999 : bIndex;
                
                return aValue - bValue;
            });
            
            console.log('Колонки с ценами отсортированы по приоритету:');
            columnTypes.price.forEach((col, index) => {
                console.log(`  ${index + 1}. ${col}`);
            });
        }
        
        // Счетчики для статистики
        let processedCount = 0;
        let skippedCount = 0;
        
        for (const row of products) {
            // Определяем название товара
            let name = '';
            for (const nameCol of columnTypes.name) {
                if (row[nameCol] !== undefined && row[nameCol] !== null && row[nameCol] !== '') {
                    name = String(row[nameCol]).trim();
                    break;
                }
            }
            
            // Если название не найдено, ищем по нестандартным колонкам
            if (!name) {
                for (const key of Object.keys(row)) {
                    if (/назван|наимен|title|name|товар/i.test(key) && row[key] && row[key] !== '') {
                        name = String(row[key]).trim();
                        break;
                    }
                }
            }
            
            // Проверяем, соответствует ли название одному из целевых
            const isTargetProduct = targetNames.some(targetName => 
                name.toLowerCase().includes(targetName.toLowerCase())
            );

            if (!isTargetProduct) {
                console.log(`Пропуск товара: "${name}" - не соответствует целевым названиям`);
                skippedCount++;
                continue;
            }

            // Проверяем, является ли товар обязательным (Мнд-160 или Мнф-150)
            const isMandatoryProduct = mandatoryNames.some(mandatoryName => 
                name.toLowerCase().includes(mandatoryName.toLowerCase())
            );

            // Получаем изображения из определенных колонок
            let imageAddress = [];
            
            for (const imgColumn of columnTypes.images) {
                if (row[imgColumn]) {
                    const rawImages = row[imgColumn];
                    
                    if (typeof rawImages === 'string') {
                        const extractedImages = rawImages
                            .split(/[;,\n|]/)
                            .map(img => img.trim())
                            .filter(img => img && img.toLowerCase().startsWith('http'));
                        
                        imageAddress = [...imageAddress, ...extractedImages];
                    } else if (Array.isArray(rawImages)) {
                        const validImages = rawImages
                            .filter(img => img && typeof img === 'string' && img.trim().toLowerCase().startsWith('http'));
                        imageAddress = [...imageAddress, ...validImages];
                    }
                }
            }
            
            imageAddress = [...new Set(imageAddress)];
            
            // Для обязательных товаров устанавливаем значение по умолчанию, если изображения отсутствуют
            if (imageAddress.length === 0 && isMandatoryProduct) {
                imageAddress = ['http://example.com/placeholder.jpg'];
                console.log(`Обязательный товар "${name}" - изображения отсутствуют, установлено значение по умолчанию`);
            } else if (imageAddress.length === 0) {
                console.warn(`Пропуск товара - отсутствуют изображения: ${name}`);
                skippedCount++;
                continue;
            }
            
            if (row['__EMPTY'] && String(row['__EMPTY']).includes('http')) {
                const imageUrl = String(row['__EMPTY']).trim();
                
                if (!imageAddress.includes(imageUrl) && imageUrl.toLowerCase().startsWith('http')) {
                    imageAddress.push(imageUrl);
                    console.log(`Добавлен URL из колонки __EMPTY: ${imageUrl}`);
                }
            }
            
            // Определяем артикул
            let article = '';
            for (const artCol of columnTypes.article) {
                if (row[artCol] !== undefined && row[artCol] !== null && row[artCol] !== '') {
                    article = String(row[artCol]).trim();
                    break;
                }
            }
            
            if (!article) {
                for (const key of Object.keys(row)) {
                    if (/артикул|код|code|id|арт/i.test(key) && row[key] && row[key] !== '') {
                        article = String(row[key]).trim();
                        break;
                    }
                }
            }
            
            // Для обязательных товаров устанавливаем артикул по умолчанию, если он отсутствует
            if (!article && isMandatoryProduct) {
                article = `MANDATORY-${Date.now()}`;
                console.log(`Обязательный товар "${name}" - артикул отсутствует, установлен: ${article}`);
            }
            
            // Определяем цену
            let price = 0;
            
            for (const priceCol of columnTypes.price) {
                if (row[priceCol] !== undefined && row[priceCol] !== null && row[priceCol] !== '') {
                    let priceStr = String(row[priceCol]).trim();
                    
                    console.log(`Исходное значение цены из колонки "${priceCol}": "${priceStr}"`);
                    
                    if (priceStr.replace(/[^\d]/g, '').length > 10) {
                        console.log(`Значение "${priceStr}" слишком длинное для цены, пропускаем`);
                        continue;
                    }
                    
                    if (priceCol === 'Розничные цены') {
                        priceStr = priceStr.replace(/,/g, '.').replace(/[^\d.]/g, '');
                    } else {
                        priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                    }
                    
                    const parsedPrice = parseFloat(priceStr);
                    
                    if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                        price = parsedPrice;
                        console.log(`Цена для товара ${article || name} найдена в колонке "${priceCol}": ${price}`);
                        break;
                    }
                }
            }
            
            if (price === 0) {
                for (const priorityCol of pricePriority) {
                    for (const key of Object.keys(row)) {
                        if (key.toLowerCase().includes(priorityCol.toLowerCase()) || 
                            priorityCol.toLowerCase().includes(key.toLowerCase())) {
                            
                            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                                let priceStr = String(row[key]).trim();
                                
                                if (priceStr.replace(/[^\d]/g, '').length > 10) {
                                    continue;
                                }
                                
                                priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                                const parsedPrice = parseFloat(priceStr);
                                
                                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                                    price = parsedPrice;
                                    console.log(`Цена для товара ${article || name} найдена по приоритету в колонке "${key}": ${price}`);
                                    
                                    if (!columnTypes.price.includes(key)) {
                                        columnTypes.price.push(key);
                                    }
                                    
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (price > 0) break;
                }
            }
            
            if (price === 0) {
                for (const key of Object.keys(row)) {
                    if (columnTypes.price.includes(key)) continue;
                    
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        const valStr = String(row[key]).trim();
                        
                        if (valStr.replace(/[^\d]/g, '').length > 10) continue;
                        
                        if (/^\d+([.,]\d+)?(\s*р)?$/i.test(valStr.replace(/\s/g, ''))) {
                            const cleanStr = valStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                            const parsedPrice = parseFloat(cleanStr);
                            
                            if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                                price = parsedPrice;
                                console.log(`Цена для товара ${article || name} найдена в колонке ${key}: ${price}`);
                                
                                if (!columnTypes.price.includes(key)) {
                                    columnTypes.price.push(key);
                                    console.log(`Добавлена новая колонка с ценой: ${key}`);
                                }
                                break;
                            }
                        }
                    }
                }
            }
            
            if (price > 1000000) {
                console.log(`Найдена подозрительно высокая цена: ${price}, сбрасываем на 0`);
                price = 0;
            }
            
            if (row['Розничные цены'] !== undefined && row['Розничные цены'] !== null && row['Розничные цены'] !== '') {
                let priceStr = String(row['Розничные цены']).trim();
                console.log(`Обработка колонки "Розничные цены": "${priceStr}"`);
                
                priceStr = priceStr.replace(/,/g, '.').replace(/[^\d.]/g, '');
                
                const parsedPrice = parseFloat(priceStr);
                
                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                    price = parsedPrice;
                    console.log(`*** Розничная цена найдена в колонке "Розничные цены": ${price}`);
                }
            }
            
            if (price === 0 && row['15'] !== undefined && row['15'] !== null && row['15'] !== '') {
                let priceStr = String(row['15']).trim();
                priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                const parsedPrice = parseFloat(priceStr);
                
                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                    price = parsedPrice;
                    console.log(`Цена найдена в колонке с индексом "15": ${price}`);
                }
            }
            
            // Для обязательных товаров устанавливаем цену по умолчанию, если она не найдена
            if (price === 0 && isMandatoryProduct) {
                price = 0; // Можно установить другое значение по умолчанию, если нужно
                console.log(`Обязательный товар "${name}" - цена отсутствует, установлено: ${price}`);
            }
            
            // Определяем остаток
            let stock = 0;
            
            if (price > 0) {
                stock = 10;
                console.log(`*** Для товара ${article || name} установлен фиксированный остаток: ${stock} (цена: ${price})`);
            } else if (row['ПартнерЦена'] !== undefined && row['ПартнерЦена'] !== null && row['ПартнерЦена'] !== '') {
                let stockStr = String(row['ПартнерЦена']).trim();
                console.log(`Проверка колонки "ПартнерЦена" для остатка: "${stockStr}"`);
                
                stockStr = stockStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
                const parsedStock = parseInt(stockStr, 10);
                
                if (!isNaN(parsedStock) && parsedStock >= 0) {
                    stock = 10;
                    console.log(`*** Для товара ${article || name} установлен фиксированный остаток: ${stock} (по ПартнерЦена)`);
                }
            } else {
                stock = 10;
                console.log(`Для товара ${article || name} установлен стандартный остаток по умолчанию: ${stock}`);
            }
            
            // Для обязательных товаров устанавливаем остаток по умолчанию
            if (stock === 0 && isMandatoryProduct) {
                stock = 10;
                console.log(`Обязательный товар "${name}" - остаток отсутствует, установлен: ${stock}`);
            }
            
            // Формируем структуру данных товара
            const productData = {
                article,
                name,
                price,
                stock,
                imageAddress,
                source: 'ЧТКProduct',
            };
            
            // Отладочная информация о товаре
            console.log('Обработанные данные товара:', {
                article: productData.article,
                name: productData.name,
                price: productData.price,
                stock: productData.stock,
                imageCount: productData.imageAddress.length
            });
            
            // Пропускаем товары с отсутствующими обязательными полями (кроме обязательных товаров)
            if (!productData.article || !productData.name) {
                console.warn('Пропуск товара - отсутствует артикул или название');
                skippedCount++;
                continue;
            }
            
            try {
                await ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );
                console.log(`Товар успешно обновлен: ${productData.article} - ${productData.name}`);
                processedCount++;
            } catch (err) {
                console.error(`Ошибка при обновлении товара: ${productData.article}`, err.message);
                skippedCount++;
            }
        }
        
        console.log(`\nРезультаты обработки:\n- Обработано товаров: ${processedCount}\n- Пропущено товаров: ${skippedCount}`);
        
    } catch (error) {
        console.error('Ошибка при обработке файла Excel:', error.message);
    }
};

// Main function
const main = async () => {
    console.log(`\n======= Запуск импорта Excel ${new Date().toLocaleString()} =======\n`);
    
    try {
        console.log('Файл для импорта:', EXCEL_FILE_PATH);
        
        const dirPath = path.dirname(EXCEL_FILE_PATH);
        if (!fs.existsSync(dirPath)) {
            console.log(`Создаем директорию: ${dirPath}`);
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            console.log(`Файл не найден, создаем пустой шаблон: ${EXCEL_FILE_PATH}`);
            
            const workbook = xlsx.utils.book_new();
            
            const headers = [
                'Артикул', 'Наименование', 'Цена', 'Остаток', 
                'Изображение', 'Дополнительная информация'
            ];
            
            const exampleData = [
                {
                    'Артикул': 'ПРИМЕР-001',
                    'Наименование': 'Пример товара',
                    'Цена': 1000,
                    'Остаток': 10,
                    'Изображение': 'http://example.com/image1.jpg;http://example.com/image2.jpg',
                    'Дополнительная информация': 'Дополнительная информация о товаре'
                }
            ];
            
            const worksheet = xlsx.utils.json_to_sheet(exampleData);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Товары');
            
            xlsx.writeFile(workbook, EXCEL_FILE_PATH);
            console.log('Создан пустой шаблон Excel');
        }
        
        await connectToDatabase();
        await uploadProductsFromExcel();
        
        await mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    } catch (error) {
        console.error('Ошибка в процессе обработки:', error.message);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            console.log('Соединение с MongoDB закрыто после ошибки.');
        }
    } finally {
        console.log(`\n======= Завершение импорта Excel ${new Date().toLocaleString()} =======\n`);
    }
};

// Запускаем скрипт с возможностью указать путь к файлу как аргумент
if (require.main === module) {
    const customPath = process.argv[2];
    
    if (customPath) {
        console.log(`Использую указанный путь к файлу: ${customPath}`);
        EXCEL_FILE_PATH = path.resolve(customPath);
    }
    
    main();
}

module.exports = { 
    uploadProductsFromExcel,
    parseXLSXFile
};