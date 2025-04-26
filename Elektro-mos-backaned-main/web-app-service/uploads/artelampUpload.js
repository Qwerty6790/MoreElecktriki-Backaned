const mongoose = require('mongoose');
const axios = require('axios');
const xlsx = require('xlsx');
const { ProductModel } = require('../app/products/productModel');  // Ensure this model is correctly defined and exported

// Connect to MongoDB
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';  // Update this with your actual MongoDB URI

    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1); // Exit the process if connection fails
    }
};

// Parse the XLSX buffer and convert it to JSON
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

// Upload products from Artelamp (parse and update MongoDB)
const uploadProductsByArtelamp = async () => {
    const url = 'https://yarusvsm.ru/ftp/Выгрузки/full.xlsx';

    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const xlsxData = response.data;
        const products = await parseXLSX(xlsxData);

        // Выведем первую строку полностью для анализа
        console.log('Первая строка данных:', JSON.stringify(products[0], null, 2));

        for (const row of products) {
            // Выведем все ключи и их значения для отладки
            Object.entries(row).forEach(([key, value]) => {
                console.log(`Колонка: "${key}" => Значение: "${value}"`);
            });
            
            // Получаем изображения из правильной колонки
            const imageAddress = row['Ссылка на изображение'] ? row['Ссылка на изображение'].split(';').map(img => img.trim()) : [];
            
            console.log(`Найденные URL изображений:`, imageAddress);

            // Добавляем новую строку к массиву imageAddress
            const additionalImage = "https://example.com/new-image.jpg";  // Replace with your image URL
            imageAddress.push(additionalImage);  // Adding a new URL to the array

            const productData = {
                article: row['Артикул поставщика'] || '',
                name: row['Наименование для сайта'] || '',
                price: parseFloat(row['РРЦ']) || 0,
                stock: parseInt(row['Свободный остаток (Регион)'], 10) || 0,
                imageAddress,
                source: 'ArtelampProduct',
            };

            // Отладочная информация
            console.log('Обработанные данные продукта:', {
                article: productData.article,
                name: productData.name,
                imageAddress: productData.imageAddress
            });

            // Skip rows with missing mandatory data
            if (!productData.article || !productData.name || !productData.price) {
                console.warn('Skipping row due to missing mandatory data:', row);
                continue;
            }

            try {
                // Upsert product data into MongoDB
                await ProductModel.findOneAndUpdate(
                    { article: productData.article }, // Search by article
                    productData, // Data to update or insert
                    { upsert: true, new: true } // If not found, insert new; if found, update
                );
                console.log(`Product successfully updated: ${productData.article}`);
            } catch (err) {
                console.error(`Error updating product: ${productData.article}`, err.message);
            }
        }
    } catch (error) {
        console.error('Error downloading or processing XLSX:', error.message);
    }
};
// Main function to connect to DB and upload products
const main = async () => {
    try {
        await connectToDatabase();  // Connect to MongoDB
        await uploadProductsByArtelamp();  // Upload products from Artelamp
        await mongoose.connection.close();  // Close the MongoDB connection
        console.log('MongoDB connection closed.');
    } catch (error) {
        console.error('Error during the process:', error.message);
    }
};

// Run the script
main();

module.exports = { uploadProductsByArtelamp };  // Export the upload function if needed