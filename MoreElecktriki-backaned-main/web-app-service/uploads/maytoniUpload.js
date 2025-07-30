const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel'); // Ensure this model is defined correctly

// MongoDB connection
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos'; // Replace with your MongoDB URI

    try {
        await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1); // Exit the process if connection fails
    }
};

// XML parsing function
const parseXML = async (xml) => {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, { explicitArray: true, trim: true }, (err, result) => {
            if (err) {
                reject('Error parsing XML: ' + err);
            } else {
                resolve(result);
            }
        });
    });
};

// Function to upload products from Maytoni
const uploadProductsByMaytoni = async () => {
    const url = 'https://mais-upload.maytoni.de/YML/all.yml';

    try {
        const response = await axios.get(url);
        const xmlData = response.data;

        const result = await parseXML(xmlData);

        if (!result?.yml_catalog?.shop?.[0]?.offers?.[0]?.offer) {
            console.error('Offers not found in XML data.');
            return;
        }

        const products = result.yml_catalog.shop[0].offers[0].offer;

        for (const lightData of products) {
            // Расширенный лог для отладки
            console.log('Parsed Maytoni product:', JSON.stringify(lightData, null, 2));
            
            // Более надежное извлечение цены
            let retailPrice = 0;
            
            // Попытка извлечь цену из разных возможных форматов
            if (lightData.priceWB && lightData.priceWB[0]) {
                retailPrice = parseFloat(lightData.priceWB[0]);
                console.log('Цена извлечена из priceWB:', retailPrice);
            } else if (lightData.price && lightData.price[0]) {
                retailPrice = parseFloat(lightData.price[0]);
                console.log('Цена извлечена из price:', retailPrice);
            } else if (lightData.prices && lightData.prices[0] && lightData.prices[0].price && lightData.prices[0].price[0]) {
                retailPrice = parseFloat(lightData.prices[0].price[0]);
                console.log('Цена извлечена из prices[0].price:', retailPrice);
            } else if (lightData.oldprice && lightData.oldprice[0]) {
                retailPrice = parseFloat(lightData.oldprice[0]);
                console.log('Цена извлечена из oldprice:', retailPrice);
            } else {
                // Поиск любого поля, которое может содержать цену
                for (const key in lightData) {
                    if (key.toLowerCase().includes('price') || key.toLowerCase().includes('цена')) {
                        if (Array.isArray(lightData[key]) && lightData[key].length > 0) {
                            retailPrice = parseFloat(lightData[key][0]);
                            console.log(`Цена извлечена из поля ${key}:`, retailPrice);
                            break;
                        }
                    }
                }
                
                // Проверка на параметры, которые могут содержать цену
                if (retailPrice === 0 && Array.isArray(lightData.param)) {
                    const priceParam = lightData.param.find(param => 
                        (param.$ && (param.$.name.toLowerCase().includes('цена') || param.$.name.toLowerCase().includes('price'))) ||
                        (param.name && (param.name[0].toLowerCase().includes('цена') || param.name[0].toLowerCase().includes('price')))
                    );
                    
                    if (priceParam) {
                        if (priceParam._) {
                            retailPrice = parseFloat(priceParam._);
                            console.log('Цена извлечена из параметра:', retailPrice);
                        } else if (priceParam.value && priceParam.value[0]) {
                            retailPrice = parseFloat(priceParam.value[0]);
                            console.log('Цена извлечена из параметра.value:', retailPrice);
                        }
                    }
                }
                
                // Проверка вложенных объектов для нахождения цены
                if (retailPrice === 0) {
                    const searchPriceInObject = (obj, path = '') => {
                        for (const key in obj) {
                            if (key.toLowerCase().includes('price') || key.toLowerCase().includes('цена')) {
                                if (Array.isArray(obj[key]) && obj[key].length > 0) {
                                    retailPrice = parseFloat(obj[key][0]);
                                    console.log(`Цена извлечена из вложенного поля ${path}.${key}:`, retailPrice);
                                    return true;
                                } else if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
                                    retailPrice = parseFloat(obj[key]);
                                    console.log(`Цена извлечена из вложенного поля ${path}.${key}:`, retailPrice);
                                    return true;
                                }
                            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                                if (searchPriceInObject(obj[key], path ? `${path}.${key}` : key)) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    };
                    
                    searchPriceInObject(lightData);
                }
                
                if (retailPrice === 0) {
                    console.log('Не удалось найти цену в данном товаре');
                }
            }
            
            // Проверка на NaN и отрицательные значения
            if (isNaN(retailPrice) || retailPrice < 0) {
                retailPrice = 0;
                console.log('Цена была некорректной, установлена в 0');
            }

            // Extract all image URLs
            const imageUrls = Array.isArray(lightData.picture) && lightData.picture.length > 0
                ? lightData.picture.map((img) => img.trim()) // Store all image URLs in an array
                : [];

            // Add a new image URL (string) to the image array
            const additionalImage = "https://example.com/new-image.jpg"; // Replace with your image URL
            imageUrls.push(additionalImage); // Add the new image URL to the array

            const productData = {
                article: lightData.vendorCode?.[0] || '',
                name: lightData.name?.[0] || '',
                price: retailPrice,
                stock: lightData.param?.find((param) => param.$?.name === 'Остаток')?._ || '0',
                imageAddress: imageUrls, // Store all image URLs in an array
                source: 'MaytoniProduct',
            };

            // Skip if mandatory fields are missing
            if (!productData.article || !productData.name) {
                console.warn(`Skipping product due to missing required fields: ${productData.article}`);
                continue;
            }

            try {
                // Update or create the product
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

    } catch (error) {
        console.error('Error fetching XML data: ' + error.message);
    }
};

// Main function to connect to the database and upload products
const main = async () => {
    try {
        await connectToDatabase(); // Connect to MongoDB
        await uploadProductsByMaytoni(); // Upload products from Maytoni
        mongoose.connection.close(); // Close the MongoDB connection
        console.log('MongoDB connection closed.');
    } catch (error) {
        console.error('Error during the process:', error.message);
    }
};

// Run the script
main();

module.exports = { uploadProductsByMaytoni }; // Export the function if needed
