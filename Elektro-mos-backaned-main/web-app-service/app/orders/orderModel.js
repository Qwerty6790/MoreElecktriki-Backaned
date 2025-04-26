const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    products: [
        {
            name: { type: String, required: true },
            article: { type: String, required: true },
            source: { type: String, required: true },
            quantity: { type: Number, default: 1 },
            status: { type: String, default: 'Ожидает подтверждения' },
            price: { type: Number, required: true } // Поле для фиксированной цены
        }
    ],
    status: { type: Array, default: ['Ожидает обработки'] },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, default: Date.now },
    totalAmount: { type: Number, default: 0 } // Добавлено поле для общей суммы
}, { timestamps: true });


const OrderModel = mongoose.model('Order', orderSchema);
module.exports = { OrderModel };
