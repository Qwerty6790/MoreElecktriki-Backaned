const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    article: { type: String, required: true },  // Артикул
    name: { type: String, required: true },     // Название
    price: { type: Number, required: true },    // Цена
    imageAddress: {
      type: [String], // Массив строк (по умолчанию)
      validate: {
        validator: function(v) {
          return Array.isArray(v) || typeof v === 'string';
        },
        message: 'imageAddress должен быть строкой или массивом строк'
      },
      default: [], // По умолчанию пустой массив
    }, // Ссылка на изображение (строка или массив строк)
    stock: { type: Number, default: 0 },         // Количество на складе
    source: { type: String, default: 'Unknown' }, // Источник данных
    visible: { type: Boolean, default: true },    // Видимость товара (для админки)
    isNew: { type: Boolean, default: false },     // Пометка товара как новинка
    updatedAt: { type: Date, default: Date.now },  // Дата последнего обновления

    // Новые поля для светильников
    socketType: { type: String, default: '' },     // Тип цоколя (E27, GU10 и т.д.)
    lampCount: { type: Number, default: 1 },       // Количество ламп
    shadeColor: { type: String, default: '' },     // Цвет плафона
    frameColor: { type: String, default: '' },     // Цвет арматуры
});

// Создание модели для коллекции товаров
const ProductModel = mongoose.model('Product', productSchema);

module.exports = { ProductModel };