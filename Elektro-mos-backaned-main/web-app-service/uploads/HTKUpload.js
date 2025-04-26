const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { ProductModel } = require('../app/products/productModel');


// Путь к файлу Excel
let EXCEL_FILE_PATH = path.join(__dirname, '../uploads/yml/ЧТКteplypol.xls');

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
    'Розничные цены',  // Добавлен новый приоритет для точного соответствия колонке из Excel
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
    // Если нет данных, вернуть пустой объект
    if (!products || products.length === 0) {
        return {
            article: [], name: [], price: [], stock: [], images: []
        };
    }

    // Колонки по типам
    const columnTypes = {
        article: [],
        name: [],
        price: [],
        stock: [],
        images: []
    };

    // Структура колонок первой строки
    const firstRow = products[0];
    
    console.log('Анализ колонок в файле:');
    
    // Сначала ищем точные совпадения для приоритетных колонок цен
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
    
    // Затем обрабатываем остальные колонки
    for (const key of Object.keys(firstRow)) {
        console.log(`- Найдена колонка: "${key}"`);
        
        // Проверяем тип колонки по ключевым словам
        let matched = false;
        for (const [type, possibleNames] of Object.entries(possibleColumnNames)) {
            // Пропускаем цены, так как уже обработали приоритетные
            if (type === 'price' && columnTypes.price.includes(key)) {
                matched = true;
                break;
            }
            
            // Проверяем совпадение по имени колонки
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
        
        // Если колонка не определена, пробуем определить по значению первой ячейки
        if (!matched && firstRow[key] !== undefined) {
            const value = String(firstRow[key]);
            
            // Проверяем по формату значения
            if (/^\d+([.,]\d+)?(\s*р)?$/i.test(value)) {
                // Похоже на цену
                columnTypes.price.push(key);
                console.log(`  → Определена как колонка цены по формату значения: "${value}"`);
            } else if (/^\d+$/.test(value)) {
                // Похоже на числовое значение - возможно остаток
                columnTypes.stock.push(key);
                console.log(`  → Определена как колонка остатка по формату значения: "${value}"`);
            } else if (value.length > 30 && /http/i.test(value)) {
                // Похоже на URL - возможно изображение
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
                
                // Если колонка не найдена в приоритетах, даем ей низкий приоритет
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
            // Получаем изображения из определенных колонок
            let imageAddress = [];
            
            // Проверяем колонки с изображениями
            for (const imgColumn of columnTypes.images) {
                if (row[imgColumn]) {
                    const rawImages = row[imgColumn];
                    
                    if (typeof rawImages === 'string') {
                        // Разделяем строку по различным разделителям
                        const extractedImages = rawImages
                            .split(/[;,\n|]/)
                            .map(img => img.trim())
                            .filter(img => img && img.toLowerCase().startsWith('http'));
                        
                        imageAddress = [...imageAddress, ...extractedImages];
                    } else if (Array.isArray(rawImages)) {
                        // Если это уже массив
                        const validImages = rawImages
                            .filter(img => img && typeof img === 'string' && img.trim().toLowerCase().startsWith('http'));
                        imageAddress = [...imageAddress, ...validImages];
                    }
                }
            }
            
            // Удаляем дубликаты URL изображений, если они есть
            imageAddress = [...new Set(imageAddress)];
            
            // Если изображений нет, пропускаем товар
            if (imageAddress.length === 0) {
                // Определяем идентификатор товара для логирования
                const itemId = 
                    columnTypes.article.map(col => row[col]).find(Boolean) || 
                    columnTypes.name.map(col => row[col]).find(Boolean) || 
                    'Неизвестный товар';
                    
                console.warn(`Пропуск товара - отсутствуют изображения: ${itemId}`);
                skippedCount++;
                continue;
            }
            
            // Дополнительно проверяем колонку со скриншота
            if (row['__EMPTY'] && String(row['__EMPTY']).includes('http')) {
                const imageUrl = String(row['__EMPTY']).trim();
                
                // Добавляем URL в список изображений, если его там еще нет и это валидный URL
                if (!imageAddress.includes(imageUrl) && imageUrl.toLowerCase().startsWith('http')) {
                    imageAddress.push(imageUrl);
                    console.log(`Добавлен URL из колонки __EMPTY: ${imageUrl}`);
                }
            }
            
            // Определяем артикул из найденных колонок
            let article = '';
            for (const artCol of columnTypes.article) {
                if (row[artCol] !== undefined && row[artCol] !== null && row[artCol] !== '') {
                    article = String(row[artCol]).trim();
                    break;
                }
            }
            
            // Если артикул не найден, проверим нестандартные имена колонок
            if (!article) {
                // Ищем колонки, содержащие ключевые слова для артикула
                for (const key of Object.keys(row)) {
                    if (/артикул|код|code|id|арт/i.test(key) && row[key] && row[key] !== '') {
                        article = String(row[key]).trim();
                        break;
                    }
                }
            }
            
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
            
            // Определяем цену
            let price = 0;
            
            // Сначала проверяем колонки с ценами по порядку приоритета
            for (const priceCol of columnTypes.price) {
                // Если уже нашли цену через специальную проверку "Розничные цены", выходим
                if (price > 0) break;
                
                if (row[priceCol] !== undefined && row[priceCol] !== null && row[priceCol] !== '') {
                    // Приводим к строке и очищаем от нечисловых символов кроме точки и запятой
                    let priceStr = String(row[priceCol]).trim();
                    
                    console.log(`Исходное значение цены из колонки "${priceCol}": "${priceStr}"`);
                    
                    // Проверяем, не является ли значение слишком длинным числом (возможно, штрихкод)
                    if (priceStr.replace(/[^\d]/g, '').length > 10) {
                        console.log(`Значение "${priceStr}" слишком длинное для цены, пропускаем`);
                        continue;
                    }
                    
                    // Специальная обработка для колонки "Розничные цены"
                    if (priceCol === 'Розничные цены') {
                        // Сначала заменяем запятую на точку для корректного парсинга десятичных чисел
                        // Затем удаляем все пробелы и нечисловые символы, кроме точки
                        priceStr = priceStr.replace(/,/g, '.').replace(/[^\d.]/g, '');
                    } else {
                        // Обычная обработка для других колонок с ценами
                        priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                    }
                    
                    // Преобразуем в число
                    const parsedPrice = parseFloat(priceStr);
                    
                    if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                        price = parsedPrice;
                        console.log(`Цена для товара ${article || name} найдена в колонке "${priceCol}": ${price}`);
                        break;
                    } else {
                        console.log(`Некорректное значение цены после обработки: ${parsedPrice}`);
                    }
                }
            }
            
            // Если цена не найдена, проверяем колонки напрямую по названиям из приоритетного списка
            if (price === 0) {
                for (const priorityCol of pricePriority) {
                    // Ищем колонку, соответствующую приоритетному названию
                    for (const key of Object.keys(row)) {
                        if (key.toLowerCase().includes(priorityCol.toLowerCase()) || 
                            priorityCol.toLowerCase().includes(key.toLowerCase())) {
                            
                            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                                let priceStr = String(row[key]).trim();
                                
                                console.log(`Проверка приоритетной цены из колонки "${key}": "${priceStr}"`);
                                
                                // Проверяем, не является ли значение слишком длинным числом (возможно, штрихкод)
                                if (priceStr.replace(/[^\d]/g, '').length > 10) {
                                    console.log(`Значение "${priceStr}" слишком длинное для цены, пропускаем`);
                                    continue;
                                }
                                
                                priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                                const parsedPrice = parseFloat(priceStr);
                                
                                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                                    price = parsedPrice;
                                    console.log(`Цена для товара ${article || name} найдена по приоритету в колонке "${key}": ${price}`);
                                    
                                    // Добавляем колонку в список цен, если её там ещё нет
                                    if (!columnTypes.price.includes(key)) {
                                        columnTypes.price.push(key);
                                    }
                                    
                                    break;
                                } else {
                                    console.log(`Некорректное значение приоритетной цены после обработки: ${parsedPrice}`);
                                }
                            }
                        }
                    }
                    
                    if (price > 0) break; // Если цена найдена, выходим из цикла
                }
            }
            
            // Если цена всё еще не найдена, ищем в любых колонках, содержащих числа похожие на цены
            if (price === 0) {
                for (const key of Object.keys(row)) {
                    // Пропускаем уже проверенные колонки
                    if (columnTypes.price.includes(key)) continue;
                    
                    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                        // Проверяем, похоже ли на цену (если содержит цифры и, возможно, разделители)
                        const valStr = String(row[key]).trim();
                        
                        // Проверяем длину числа - слишком длинные числа не могут быть ценами
                        if (valStr.replace(/[^\d]/g, '').length > 10) continue;
                        
                        // Проверяем, похоже ли на цену (без символов валюты и с разделителями)
                        if (/^\d+([.,]\d+)?(\s*р)?$/i.test(valStr.replace(/\s/g, ''))) {
                            // Удаляем все нечисловые символы кроме точки и запятой
                            const cleanStr = valStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                            const parsedPrice = parseFloat(cleanStr);
                            
                            if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                                price = parsedPrice;
                                console.log(`Цена для товара ${article || name} найдена в колонке ${key}: ${price}`);
                                // Добавляем колонку, чтобы использовать её для других товаров
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
            
            // Добавляем проверку на штрихкод или другое некорректное значение цены
            if (price > 1000000) {
                console.log(`Найдена подозрительно высокая цена: ${price}, сбрасываем на 0`);
                price = 0;
            }
            
            // Проверяем специально колонку "Розничные цены" - приоритетная обработка
            if (row['Розничные цены'] !== undefined && row['Розничные цены'] !== null && row['Розничные цены'] !== '') {
                let priceStr = String(row['Розничные цены']).trim();
                console.log(`Обработка колонки "Розничные цены": "${priceStr}"`);
                
                // Сначала заменяем запятую на точку для корректного парсинга десятичных чисел
                // Затем удаляем все пробелы и нечисловые символы, кроме точки
                priceStr = priceStr.replace(/,/g, '.').replace(/[^\d.]/g, '');
                
                const parsedPrice = parseFloat(priceStr);
                
                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                    price = parsedPrice;
                    console.log(`*** Розничная цена найдена в колонке "Розничные цены": ${price}`);
                } else {
                    console.log(`Некорректное значение в колонке "Розничные цены": ${priceStr}`);
                }
            }
            
            // Добавляем проверку конкретно на колонку "15" (если это индекс колонки в файле)
            if (price === 0 && row['15'] !== undefined && row['15'] !== null && row['15'] !== '') {
                let priceStr = String(row['15']).trim();
                priceStr = priceStr.replace(/[^\d.,]/g, '').replace(/,/g, '.');
                const parsedPrice = parseFloat(priceStr);
                
                if (!isNaN(parsedPrice) && parsedPrice > 0 && parsedPrice < 1000000) {
                    price = parsedPrice;
                    console.log(`Цена найдена в колонке с индексом "15": ${price}`);
                }
            }
            
            // Определяем остаток
            let stock = 0;
            
            // Для всех товаров с розничной ценой устанавливаем фиксированный остаток
            if (price > 0) {
                stock = 10; // Устанавливаем фиксированное значение остатка 10
                console.log(`*** Для товара ${article || name} установлен фиксированный остаток: ${stock} (цена: ${price})`);
            }
            // Если розничной цены нет, но есть "ПартнерЦена", тоже устанавливаем остаток
            else if (row['ПартнерЦена'] !== undefined && row['ПартнерЦена'] !== null && row['ПартнерЦена'] !== '') {
                let stockStr = String(row['ПартнерЦена']).trim();
                console.log(`Проверка колонки "ПартнерЦена" для остатка: "${stockStr}"`);
                
                // Очищаем значение от нечисловых символов
                stockStr = stockStr.replace(/\s/g, '').replace(/,/g, '.').replace(/[^\d.]/g, '');
                const parsedStock = parseInt(stockStr, 10);
                
                if (!isNaN(parsedStock) && parsedStock >= 0) {
                    stock = 10; // Устанавливаем фиксированное значение остатка 10
                    console.log(`*** Для товара ${article || name} установлен фиксированный остаток: ${stock} (по ПартнерЦена)`);
                }
            }
            // Если еще нет значения остатка, применяем обычные методы определения
            else {
                // Если остаток всё ещё не определён, устанавливаем значение по умолчанию
                stock = 10; // Устанавливаем фиксированное значение остатка 10
                console.log(`Для товара ${article || name} установлен стандартный остаток по умолчанию: ${stock}`);
            }
            
            // Формируем структуру данных товара
            const productData = {
                article,
                name,
                price,
                stock,
                imageAddress,
                source: 'ЧТКProduct', // Источник данных
            };
            
            // Отладочная информация о товаре
            console.log('Обработанные данные товара:', {
                article: productData.article,
                name: productData.name,
                price: productData.price,
                stock: productData.stock,
                imageCount: productData.imageAddress.length
            });
            
            // Пропускаем товары с отсутствующими обязательными полями
            if (!productData.article || !productData.name) {
                console.warn('Пропуск товара - отсутствует артикул или название');
                skippedCount++;
                continue;
            }
            
            try {
                // Обновляем или добавляем товар в MongoDB
                await ProductModel.findOneAndUpdate(
                    { article: productData.article }, // Поиск по артикулу
                    productData, // Данные для обновления или вставки
                    { upsert: true, new: true } // Если не найден - создать, если найден - обновить
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
        
        // Проверяем существование директории для файла
        const dirPath = path.dirname(EXCEL_FILE_PATH);
        if (!fs.existsSync(dirPath)) {
            console.log(`Создаем директорию: ${dirPath}`);
            fs.mkdirSync(dirPath, { recursive: true });
        }
        
        // Если файла нет, создаем пустой шаблон
        if (!fs.existsSync(EXCEL_FILE_PATH)) {
            console.log(`Файл не найден, создаем пустой шаблон: ${EXCEL_FILE_PATH}`);
            
            // Создаем новую рабочую книгу
            const workbook = xlsx.utils.book_new();
            
            // Создаем шаблон с заголовками
            const headers = [
                'Артикул', 'Наименование', 'Цена', 'Остаток', 
                'Изображение', 'Дополнительная информация'
            ];
            
            // Создаем данные с примером
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
            
            // Создаем лист и добавляем в книгу
            const worksheet = xlsx.utils.json_to_sheet(exampleData);
            xlsx.utils.book_append_sheet(workbook, worksheet, 'Товары');
            
            // Сохраняем файл
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
        // Обновляем путь к файлу, если указан в аргументах
        console.log(`Использую указанный путь к файлу: ${customPath}`);
        EXCEL_FILE_PATH = path.resolve(customPath);
    }
    
    main();
}

module.exports = { 
    uploadProductsFromExcel,
    parseXLSXFile
};