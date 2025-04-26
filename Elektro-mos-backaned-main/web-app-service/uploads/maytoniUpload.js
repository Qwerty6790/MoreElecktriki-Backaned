const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel'); // Ensure this model is defined correctly

// MongoDB connection
const connectToDatabase = async () => {
    const mongoURI = 'mongodb+srv://MoreSvet:Qwerty670Im@cluster0moresvet.bgvlr.mongodb.net/MoreSvet?retryWrites=true&w=majority&appName=Cluster0MoreSvet'; // Replace with your MongoDB URI

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
            // Extract price from `priceWB`
            const retailPrice = lightData.priceWB?.[0]
                ? parseFloat(lightData.priceWB[0])
                : 0;

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
