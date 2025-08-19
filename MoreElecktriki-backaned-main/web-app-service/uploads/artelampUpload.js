const mongoose = require('mongoose');
const axios = require('axios');
const xlsx = require('xlsx');
const { ProductModel } = require('../app/products/productModel');

// --- Подключение к MongoDB
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



// --- Маппинг колонок Excel → поля модели
const columnMapping = {
    article: ['Артикул поставщика', 'Артикул', 'Код'],
    name: ['Наименование для сайта', 'Наименование', 'Название'],
    price: ['РРЦ', 'Цена', 'Стоимость'],
    stock: ['Свободный остаток (Регион)', 'Остаток', 'Количество на складе'],
    imageAddress: ['Ссылка на изображение', 'Фото', 'Изображение'],

    // Исправленные названия колонок
    shadeColor: ['Цвет плафона/декора', 'Цвет плафона', 'Плафон цвет', 'Цвет абажура'],
    frameColor: ['Цвет арматуры', 'Арматура цвет', 'Цвет корпуса'],
    
    // Добавляем лампы
    lampCount: ['Количество патронов', 'Патроны', 'Кол-во ламп']
    // socketType убран - оставляем пустым для Artelamp
};

// --- Дополнительные колонки для ламп (если есть вторые колонки)
const lampColumns = {
    count: ['Количество патронов', 'Количество патронов 2']
    // type убран - не используется для Artelamp
};

// --- Утилита: найти ключ по синонимам
const getValue = (row, field) => {
    const synonyms = columnMapping[field];
    if (!synonyms) return null;

    for (const key of synonyms) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
            return row[key];
        }
    }
    return null;
};

// --- Утилита: обработка типа лампы
const processSocketType = (socketType) => {
    if (!socketType) return '';
    
    return String(socketType).trim();
};

// --- Получаем данные для ламп (только количество, тип цоколя оставляем пустым)
const getLampData = (row) => {
    // Получаем только количество ламп
    let lampCount = getValue(row, 'lampCount');
    
    // Если не нашли, пытаемся из дополнительных колонок
    if (!lampCount) {
        const count1 = row[lampColumns.count[0]];
        const count2 = row[lampColumns.count[1]];
        lampCount = lampCount || count1 || count2;
    }

    return {
        lampCount: parseInt(lampCount || 1, 10),
        socketType: ''  // Всегда пустая строка для Artelamp
    };
};

// --- Парсинг XLSX
const parseXLSX = async (buffer) => {
    try {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        return xlsx.utils.sheet_to_json(worksheet);
    } catch (error) {
        throw new Error('Error parsing XLSX file: ' + error.message);
    }
};

// --- Загрузка товаров
const uploadProductsByArtelamp = async () => {
    const url = 'https://yarusvsm.ru/ftp/Выгрузки/full.xlsx';

    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const products = await parseXLSX(response.data);

        console.log('Первая строка данных:', JSON.stringify(products[0], null, 2));
        console.log('Ключи первой строки:', Object.keys(products[0]));

        let successCount = 0;
        let skippedCount = 0;

        for (const row of products) {
            const imageAddress = getValue(row, 'imageAddress')
                ? String(getValue(row, 'imageAddress')).split(';').map(img => img.trim())
                : [];

            const lampData = getLampData(row);

            const productData = {
                article: getValue(row, 'article') || '',
                name: getValue(row, 'name') || '',
                price: parseFloat(getValue(row, 'price')) || 0,
                stock: parseInt(getValue(row, 'stock'), 10) || 0,
                imageAddress,
                source: 'Artelamp',

                lampCount: lampData.lampCount,
                socketType: lampData.socketType,

                shadeColor: getValue(row, 'shadeColor') || '',
                frameColor: getValue(row, 'frameColor') || ''
            };

            console.log('Обработанные данные продукта:', {
                article: productData.article,
                name: productData.name,
                price: productData.price,
                stock: productData.stock,
                lampCount: productData.lampCount,
                socketType: productData.socketType,
                shadeColor: productData.shadeColor,
                frameColor: productData.frameColor
            });

            if (!productData.article || !productData.name || !productData.price || productData.stock <= 0) {
                console.warn('Пропускаем строку из-за отсутствующих обязательных данных или нулевого остатка:', {
                    article: productData.article,
                    name: productData.name,
                    price: productData.price,
                    stock: productData.stock
                });
                skippedCount++;
                continue;
            }

            try {
                await ProductModel.findOneAndUpdate(
                    { article: productData.article },
                    productData,
                    { upsert: true, new: true }
                );
                console.log(`Товар успешно обновлен: ${productData.article}`);
                successCount++;
            } catch (err) {
                console.error(`Ошибка обновления товара: ${productData.article}`, err.message);
            }
        }

        console.log(`\nИтого обработано: ${products.length} строк`);
        console.log(`Успешно обновлено: ${successCount} товаров`);
        console.log(`Пропущено: ${skippedCount} товаров`);

    } catch (error) {
        console.error('Ошибка загрузки или обработки XLSX:', error.message);
    }
};

// --- Main
const main = async () => {
    try {
        await connectToDatabase();
        await uploadProductsByArtelamp();
        await mongoose.connection.close();
        console.log('Соединение с MongoDB закрыто.');
    } catch (error) {
        console.error('Ошибка в процессе выполнения:', error.message);
    }
};

main();

module.exports = { uploadProductsByArtelamp };