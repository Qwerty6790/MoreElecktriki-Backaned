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
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: function() { return !this.isGuest; } // Обязательно только для авторизованных пользователей
    },
    // Данные для гостевых заказов
    isGuest: { type: Boolean, default: false },
    guestInfo: {
        name: { 
            type: String, 
            required: function() { return this.isGuest; }
        },
        surname: { 
            type: String, 
            required: function() { return this.isGuest; }
        },
        phone: { 
            type: String, 
            required: function() { return this.isGuest; }
        },
        email: { 
            type: String, 
            required: function() { return this.isGuest; }
        },
        comment: { type: String, default: '' },
        address: { type: String, default: '' }
    },
    createdAt: { type: Date, default: Date.now },
    totalAmount: { type: Number, default: 0 } // Добавлено поле для общей суммы
}, { timestamps: true });

const OrderModel = mongoose.model('Order', orderSchema);
module.exports = { OrderModel };
