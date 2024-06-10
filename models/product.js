const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String }, // New
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  category: { type: String } // New
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
