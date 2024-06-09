const mongoose = require('mongoose');

const productIdMappingSchema = new mongoose.Schema({
  smartContractId: { type: Number, required: true, unique: true },
  mongoId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, ref: 'Product' },
});

const ProductIdMapping = mongoose.model('ProductIdMapping', productIdMappingSchema);

module.exports = ProductIdMapping;