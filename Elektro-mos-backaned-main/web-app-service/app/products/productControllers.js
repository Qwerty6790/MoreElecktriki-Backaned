const { ProductModel } = require('./productModel');
const { v2: cloudinary } = require('cloudinary');
const streamifier = require('streamifier');

const validSources = [
    'OdeonLightProduct','StluceProduct','FavouriteProduct', 'LightStarProduct', 'MaytoniProduct',
    'ElektroStandardProduct', 'DenkirsProduct', 'WerkelProduct', 'KinkLightProduct', 'NovotechLightProduct','LumionProduct','ArtelampProduct','SonexProduct','VoltumProduct', 'ЧТКProduct', 'DonelProduct','DonelluxProduct' 
];

const categorySuggestions = [
   
];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Функция для извлечения ключевых слов из названия продукта
function extractKeywords(productName) {
    if (!productName) return [];
    
    // Разбиваем название на слова
    const words = productName.split(/\s+/);
    
    // Фильтруем слова
    const keywords = words.filter(word => {
        // Оставляем слова длиннее 3 символов
        if (word.length < 3) return false;
        
        // Оставляем слова в верхнем регистре (потенциально модели/серии)
        if (word === word.toUpperCase() && word.length >= 3) return true;
        
        // Оставляем слова, которые не являются общими предлогами, союзами и т.д.
        const commonWords = ['для', 'под', 'над', 'при', 'или', 'как', 'что', 'чем', 'кто', 'где'];
        return !commonWords.includes(word.toLowerCase());
    });
    
    return keywords;
}

// Функция для поиска похожих товаров по ключевым словам или артикулу
function findSimilarProductsByKeywords(products, targetKeywords, targetArticle) {
    if (!products || !products.length) return [];
    if ((!targetKeywords || !targetKeywords.length) && !targetArticle) return [];
    
    // Веса для разных типов совпадений
    const upperCaseMatchWeight = 3;  // Совпадение по слову в верхнем регистре
    const normalWordMatchWeight = 1; // Совпадение по обычному слову
    const articleMatchWeight = 5;    // Совпадение по части артикула
    
    // Оценка похожести для каждого продукта
    const scoredProducts = products.map(product => {
        let score = 0;
        
        // Извлекаем ключевые слова из текущего продукта
        const productKeywords = extractKeywords(product.name);
        
        // Сравниваем ключевые слова
        if (targetKeywords && targetKeywords.length) {
            for (const targetWord of targetKeywords) {
                for (const productWord of productKeywords) {
                    // Проверяем совпадение в верхнем регистре (например, COPPA)
                    if (targetWord === targetWord.toUpperCase() && 
                        productWord === productWord.toUpperCase() && 
                        productWord.includes(targetWord)) {
                        score += upperCaseMatchWeight;
                    } 
                    // Проверяем обычное совпадение
                    else if (productWord.toLowerCase().includes(targetWord.toLowerCase())) {
                        score += normalWordMatchWeight;
                    }
                }
            }
        }
        
        // Сравниваем артикулы
        if (targetArticle && product.article) {
            // Если артикулы начинаются одинаково
            if (product.article.toLowerCase().startsWith(targetArticle.toLowerCase()) || 
                targetArticle.toLowerCase().startsWith(product.article.toLowerCase())) {
                score += articleMatchWeight;
            }
            // Если часть артикула совпадает
            else if (product.article.toLowerCase().includes(targetArticle.toLowerCase()) || 
                     targetArticle.toLowerCase().includes(product.article.toLowerCase())) {
                score += articleMatchWeight / 2;
            }
        }
        
        return { product, score };
    });
    
    // Сортируем по убыванию оценки и фильтруем продукты с нулевой оценкой
    const filteredProducts = scoredProducts
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.product);
    
    return filteredProducts;
}

function findSuggestedCategory(productName) {
    for (const suggestion of categorySuggestions) {
        for (const keyword of suggestion.keywords) {
            if (productName.toLowerCase().includes(keyword.toLowerCase())) {
                return suggestion.category;
            }
        }
    }
    return 'Другая категория'; // Если не найдено соответствие
}

const findSuggestedCategories = (name) => 
    categorySuggestions.filter(({ keywords }) => 
        keywords.some(keyword => name.toLowerCase().includes(keyword))
    ).map(({ category }) => category);

const buildQuery = ({ name, minPrice, maxPrice, source, description, material, article, showHidden = false }) => {
    const query = {
        name: new RegExp(name.split(',')[0] || '', 'i'),  // Регулярное выражение для названия
        price: { $gte: parseFloat(minPrice) || 0, $lte: parseFloat(maxPrice) || Infinity },
        ...(description && { description: new RegExp(description, 'i') }),
        ...(material && { description: new RegExp(material, 'i') }),
        ...(article && { article: new RegExp(article, 'i') })
    };

    // Для фильтрации по бренду
    if (source) {
        // Если source передан, используем его как точное совпадение
        query.source = { $regex: new RegExp(source, 'i') };  // Для поиска по регулярному выражению
    } else {
        // Если source не передан, фильтруем по допустимым брендам
        query.source = { $in: validSources };
    }

    // Фильтрация по видимости, если не указан параметр showHidden = true,
    // показываем только видимые товары
    if (!showHidden) {
        query.visible = { $ne: false };
    }

    return query;
};

exports.getProducts = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 14, 
            name = '', 
            minPrice, 
            maxPrice, 
            source, 
            description, 
            material,
            article,
            showHidden = false,
            randomize = 'true'  // Устанавливаем по умолчанию значение 'true' как строку
        } = req.query;
        
        const query = buildQuery({ 
            name, 
            minPrice, 
            maxPrice, 
            source, 
            description, 
            material,
            article,
            showHidden: showHidden === 'true'
        });

        // Получаем товары и их общее количество
        let productsQuery = ProductModel.find(query);
        
        // Если запрошена случайная сортировка или не указано иное, используем MongoDB aggregation с $sample
        // Для отключения случайной сортировки нужно явно указать randomize=false
        if (randomize !== 'false') {
            // Получаем общее количество товаров для пагинации
            const totalProducts = await ProductModel.countDocuments(query);
            
            // Используем MongoDB aggregation для случайной выборки
            const randomProducts = await ProductModel.aggregate([
                { $match: query },
                { $sample: { size: parseInt(limit) } }
            ]);
            
            // Ответ с товарами в случайном порядке
            return res.json({
                totalProducts,
                totalPages: Math.ceil(totalProducts / limit),
                currentPage: +page,
                products: randomProducts,
                suggestedCategories: findSuggestedCategories(name)
            });
        } else {
            // Стандартная пагинация без случайной сортировки
            const [products, totalProducts] = await Promise.all([
                productsQuery.skip((page - 1) * limit).limit(+limit),
                ProductModel.countDocuments(query)
            ]);
            
            // Ответ с товарами
            res.json({
                totalProducts,
                totalPages: Math.ceil(totalProducts / limit),
                currentPage: +page,
                products,
                suggestedCategories: findSuggestedCategories(name)
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getProductByArticle = async (req, res) => {
    try {
        const { productArticle, source } = req.query;
        const product = await ProductModel.findOne({ article: productArticle, source: source ? { $regex: new RegExp(source, 'i') } : { $in: validSources } });
        product ? res.json(product) : res.status(404).json({ message: 'Товар не найден' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getProductList = async (req, res) => {
    try {
        const { products } = req.body;
        const { source, showHidden = false } = req.query;
        
        if (!Array.isArray(products) || !products.length) {
            return res.status(400).json({ message: 'Invalid product list' });
        }
        
        const sourceFilter = source ? 
            { source: { $regex: new RegExp(source, 'i') } } : 
            { source: { $in: validSources } };
        
        // Добавляем фильтр видимости
        const visibilityFilter = showHidden === 'true' ? {} : { visible: { $ne: false } };
        
        const productDetails = await Promise.all(products.map(async ({ article, quantity }) => {
            const product = await ProductModel.findOne({ 
                article, 
                ...sourceFilter,
                ...visibilityFilter
            });
            
            return product ? 
                { ...product.toObject(), quantity } : 
                { article, quantity, error: 'Product not found' };
        }));
        
        res.json({ products: productDetails });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.searchProductsByName = async (req, res) => {
    try {
        const { name = '', page = 1, pageSize = 10, source, showHidden = false } = req.query;
        
        const query = { 
            name: new RegExp(name, 'i'), 
            source: source ? { $regex: new RegExp(source, 'i') } : { $in: validSources } 
        };
        
        // Добавляем фильтрацию по видимости
        if (showHidden !== 'true') {
            query.visible = { $ne: false };
        }
        
        const [products, totalProducts] = await Promise.all([
            ProductModel.find(query).skip((page - 1) * pageSize).limit(+pageSize),
            ProductModel.countDocuments(query)
        ]);
        
        res.json({ 
            totalProducts, 
            totalPages: Math.ceil(totalProducts / pageSize), 
            currentPage: +page, 
            products 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Новый контроллер для поиска похожих товаров
exports.getSimilarProducts = async (req, res) => {
    try {
        const { keywords, article, source, limit = 20, showHidden = false } = req.query;
        
        if (!keywords && !article) {
            return res.status(400).json({ 
                message: 'Необходимо указать ключевые слова (keywords) или артикул (article)' 
            });
        }
        
        // Базовый запрос для получения товаров
        const baseQuery = {
            source: source ? { $regex: new RegExp(source, 'i') } : { $in: validSources }
        };
        
        // Фильтрация по видимости
        if (showHidden !== 'true') {
            baseQuery.visible = { $ne: false };
        }
        
        // Если есть ключевые слова, добавляем к запросу
        if (keywords) {
            const keywordsArray = keywords.split(',');
            // Добавляем поиск по названию для каждого ключевого слова
            baseQuery.$or = keywordsArray.map(keyword => ({ 
                name: new RegExp(keyword.trim(), 'i') 
            }));
        }
        
        // Если есть артикул, добавляем его к запросу
        if (article) {
            if (baseQuery.$or) {
                baseQuery.$or.push({ article: new RegExp(article, 'i') });
            } else {
                baseQuery.$or = [{ article: new RegExp(article, 'i') }];
            }
        }
        
        // Получаем товары из базы
        const baseProducts = await ProductModel.find(baseQuery).limit(parseInt(limit) * 2);
        
        if (!baseProducts.length) {
            return res.json({ 
                message: 'Товары по указанным критериям не найдены',
                products: [] 
            });
        }
        
        // Обрабатываем ключевые слова
        const processedKeywords = keywords ? 
            keywords.split(',').map(k => k.trim()) : 
            baseProducts[0].name ? extractKeywords(baseProducts[0].name) : [];
        
        // Находим похожие товары
        const similarProducts = findSimilarProductsByKeywords(
            baseProducts, 
            processedKeywords, 
            article
        ).slice(0, parseInt(limit));
        
        // Возвращаем результат
        res.json({
            totalProducts: similarProducts.length,
            searchCriteria: {
                keywords: processedKeywords,
                article: article || 'не указан'
            },
            products: similarProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Новые контроллеры для управления товарами в админке

// Обновление информации о товаре
exports.updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, stock, imageAddress } = req.body;
        
        // Проверка наличия обязательных полей
        if (!name && !price && !stock && !imageAddress) {
            return res.status(400).json({ 
                message: 'Необходимо указать хотя бы одно поле для обновления' 
            });
        }
        
        // Подготовка объекта с данными для обновления
        const updateData = {};
        if (name) updateData.name = name;
        if (price !== undefined) updateData.price = parseFloat(price);
        if (stock !== undefined) updateData.stock = parseInt(stock);
        if (imageAddress) updateData.imageAddress = imageAddress;
        
        // Обновление товара в базе данных
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            id, 
            updateData, 
            { new: true, runValidators: true }
        );
        
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Товар не найден' });
        }
        
        // Возвращаем обновленный товар
        res.json({
            message: 'Товар успешно обновлен',
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Обновление видимости товара
exports.updateProductVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const { visible } = req.body;
        
        // Проверка наличия обязательного поля
        if (visible === undefined) {
            return res.status(400).json({ 
                message: 'Необходимо указать параметр visible' 
            });
        }
        
        // Обновление видимости товара
        const updatedProduct = await ProductModel.findByIdAndUpdate(
            id, 
            { visible: Boolean(visible) }, 
            { new: true }
        );
        
        if (!updatedProduct) {
            return res.status(404).json({ message: 'Товар не найден' });
        }
        
        // Возвращаем обновленный товар
        res.json({
            message: `Товар ${visible ? 'отображается' : 'скрыт'}`,
            product: updatedProduct
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Удаление товара
exports.deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Удаление товара из базы данных
        const deletedProduct = await ProductModel.findByIdAndDelete(id);
        
        if (!deletedProduct) {
            return res.status(404).json({ message: 'Товар не найден' });
        }
        
        // Возвращаем информацию об удаленном товаре
        res.json({
            message: 'Товар успешно удален',
            product: {
                id: deletedProduct._id,
                name: deletedProduct.name,
                article: deletedProduct.article
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createProduct = async (req, res) => {
    try {
      const { article, name, price, stock, source } = req.body;
      let imageUrls = [];
  
      // Проверка обязательных полей
      if (!article || !name || !price) {
        return res.status(400).json({ 
          message: 'Поля article, name и price обязательны' 
        });
      }
  
      // Если есть файл изображения — загружаем его на Cloudinary
      if (req.file) {
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            { folder: 'products' },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
        });
  
        imageUrls.push(uploadResult.secure_url);
      }
  
      // Создаем товар
      const newProduct = await ProductModel.create({
        article,
        name,
        price: parseFloat(price),
        stock: stock !== undefined ? parseInt(stock) : 0,
        source: source || 'Unknown',
        imageAddress: imageUrls,
        visible: true
      });
  
      res.status(201).json({
        message: 'Товар успешно создан',
        product: newProduct
      });
  
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

// Функция для категоризации товаров серии W55 по типу установки
function categorizeW55Products(products) {
    const categories = {
        'Накладные розетки W55': [],
        'Встроенный монтаж W55': []
    };
    
    products.forEach(product => {
        const productName = product.name.toLowerCase();
        const productDescription = (product.description || '').toLowerCase();
        const fullText = `${productName} ${productDescription}`;
        
        // Ключевые слова для накладного монтажа
        const surfaceMountKeywords = [
            'накладная', 'накладной',
        ];
        
        // Ключевые слова для скрытого/встроенного монтажа
        const flushMountKeywords = [
            'для скрытой установки', 'скрытой установки', 
        ];
        
        // Проверяем на накладной монтаж
        const isSurfaceMount = surfaceMountKeywords.some(keyword => 
            fullText.includes(keyword)
        );
        
        // Проверяем на встроенный/скрытый монтаж
        const isFlushMount = flushMountKeywords.some(keyword => 
            fullText.includes(keyword)
        );
        
        // Распределяем по категориям с приоритетом для более специфичных ключевых слов
        if (fullText.includes('для скрытой установки') || fullText.includes('рамка с клавишей')) {
            // Высокий приоритет для явных указаний на скрытую установку
            categories['Встроенный монтаж W55'].push(product);
        } else if (isSurfaceMount && !isFlushMount) {
            // Накладные товары
            categories['Накладные розетки W55'].push(product);
        } else if (isFlushMount && !isSurfaceMount) {
            // Встроенные товары
            categories['Встроенный монтаж W55'].push(product);
        } else if (isSurfaceMount && isFlushMount) {
            // Если есть оба типа ключевых слов, смотрим на более специфичные
            if (fullText.includes('накладная') || fullText.includes('накладной')) {
                categories['Накладные розетки W55'].push(product);
            } else {
                categories['Встроенный монтаж W55'].push(product);
            }
        } else {
            // По умолчанию определяем по общим словам в названии
            if (fullText.includes('розетка') || fullText.includes('выключател')) {
                // Если не можем определить точно, добавляем в накладные
                categories['Накладные розетки W55'].push(product);
            } else {
                // Рамки, клавиши и подобное - обычно для скрытой установки
                categories['Встроенный монтаж W55'].push(product);
            }
        }
    });
    
    return categories;
}

// Контроллер для получения всех товаров W55, отсортированных по категориям
exports.getW55CategorizedProducts = async (req, res) => {
    try {
        const { source, showHidden = false, page = 1, limit = 100 } = req.query;
        
        // Строим запрос для поиска товаров W55
        const query = {
            name: new RegExp('W55', 'i'),
            source: source ? { $regex: new RegExp(source, 'i') } : { $in: validSources }
        };
        
        // Фильтрация по видимости
        if (showHidden !== 'true') {
            query.visible = { $ne: false };
        }
        
        // Получаем общее количество товаров W55 для пагинации
        const totalW55Products = await ProductModel.countDocuments(query);
        
        // Получаем все товары W55 (для корректной категоризации)
        const w55Products = await ProductModel.find(query)
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        if (!w55Products.length) {
            return res.json({
                message: 'Товары серии W55 не найдены',
                categories: {
                    'Накладные розетки W55': [],
                    'Встроенный монтаж W55': []
                },
                totalProducts: 0,
                totalW55Products: 0
            });
        }
        
        // Категоризируем товары
        const categorizedProducts = categorizeW55Products(w55Products);
        
        // Подсчитываем общее количество товаров в каждой категории
        const totalProducts = Object.values(categorizedProducts).reduce(
            (sum, categoryProducts) => sum + categoryProducts.length, 0
        );
        
        res.json({
            message: 'Товары серии W55 успешно категоризированы по типу установки',
            categories: categorizedProducts,
            totalProducts,
            totalW55Products,
            totalPages: Math.ceil(totalW55Products / limit),
            currentPage: parseInt(page),
            categoryStats: {
                'Накладные розетки W55': categorizedProducts['Накладные розетки W55'].length,
                'Встроенный монтаж W55': categorizedProducts['Встроенный монтаж W55'].length
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Контроллер для получения товаров W55 по конкретной категории установки
exports.getW55ProductsByCategory = async (req, res) => {
    try {
        const { category, source, showHidden = false, page = 1, limit = 50 } = req.query;
        
        if (!category) {
            return res.status(400).json({
                message: 'Необходимо указать категорию',
                availableCategories: ['surface', 'flush', 'накладные', 'встроенные']
            });
        }
        
        // Базовый запрос для поиска товаров W55
        const baseQuery = {
            name: new RegExp('W55', 'i'),
            source: source ? { $regex: new RegExp(source, 'i') } : { $in: validSources }
        };
        
        // Фильтрация по видимости
        if (showHidden !== 'true') {
            baseQuery.visible = { $ne: false };
        }
        
        // Сначала получаем все товары W55, затем фильтруем их
        const allW55Products = await ProductModel.find(baseQuery);
        const categorizedProducts = categorizeW55Products(allW55Products);
        
        let selectedProducts = [];
        let categoryName = '';
        
        if (category === 'surface' || category === 'накладные') {
            selectedProducts = categorizedProducts['Накладные розетки W55'];
            categoryName = 'Накладные розетки W55';
        } else if (category === 'flush' || category === 'встроенные') {
            selectedProducts = categorizedProducts['Встроенный монтаж W55'];
            categoryName = 'Встроенный монтаж W55';
        } else {
            return res.status(400).json({
                message: 'Неверная категория',
                availableCategories: ['surface', 'flush', 'накладные', 'встроенные']
            });
        }
        
        // Применяем пагинацию к отфильтрованным товарам
        const totalProducts = selectedProducts.length;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedProducts = selectedProducts.slice(startIndex, endIndex);
        
        res.json({
            message: `Товары категории "${categoryName}" найдены`,
            category: categoryName,
            totalProducts,
            totalPages: Math.ceil(totalProducts / limit),
            currentPage: parseInt(page),
            products: paginatedProducts
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};