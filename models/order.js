const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: { type: Number, required: true, unique: true },
  productName: { type: String, required: true }, // Change from productId to productName
  quantity: { type: Number, required: true },
  buyer: { type: String, required: true },
  status: { type: String, required: true }
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
