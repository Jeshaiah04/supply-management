require('./telegramBot');
const mongoose = require('mongoose');
const express = require('express');
const app = express();
const Web3 = require('web3');
const contract = require('@truffle/contract');
const SupplyManagementArtifact = require('./artifacts/contracts/SupplyManagement.sol/SupplyManagement.json');
const Product = require('./models/product');
const ProductIdMapping = require('./models/ProductIdMapping');
const Counter = require('./models/counter'); // Add this line
const connectDB = require('./database');

// Connect to MongoDB
connectDB();

const web3 = new Web3('HTTP://127.0.0.1:7545'); // Change to the appropriate Ganache URL
const contractAddress = '0x63Ea19f041A4D284EAC386Cc93f535655a7ADe00'; // Change to the appropriate contract address
const supplyManagement = new web3.eth.Contract(SupplyManagementArtifact.abi, contractAddress);

// Function to save product ID mapping
async function saveProductIdMapping(smartContractId, mongoId) {
  const idMapping = new ProductIdMapping({ smartContractId, mongoId });
  await idMapping.save();
}

// Function to get MongoDB ID from smart contract ID
async function getMongoIdFromSmartContractId(smartContractId) {
  const idMapping = await ProductIdMapping.findOne({ smartContractId });
  return idMapping ? idMapping.mongoId : null;
}

// Function to get smart contract ID from MongoDB ID
async function getSmartContractIdFromMongoId(mongoId) {
  const idMapping = await ProductIdMapping.findOne({ mongoId });
  return idMapping ? idMapping.smartContractId : null;
}

// Counter initialization function
async function initializeCounter() {
  const existingCounter = await Counter.findOne({ name: 'productId' });
  if (!existingCounter) {
    const counter = new Counter({ name: 'productId', seq: 0 });
    await counter.save();
  }
}

// Initialize counter when server starts
initializeCounter().catch(err => console.error("Failed to initialize counter:", err));

// Listen to contract events
supplyManagement.events.ProductAdded()
  .on('data', async (event) => {
    const { id, name, price, quantity } = event.returnValues;
    await addProductHandler(id, name, price, quantity);
  })
  .on('error', console.error);

supplyManagement.events.ProductUpdated()
  .on('data', async (event) => {
    const { id, name, price, quantity } = event.returnValues;
    await updateProductHandler(id, name, price, quantity);
  })
  .on('error', console.error);

supplyManagement.events.ProductDeleted()
  .on('data', async (event) => {
    const { id } = event.returnValues;
    await deleteProductHandler(id);
  })
  .on('error', console.error);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));

app.get('/', async (req, res) => {
  try {
    const productCount = await supplyManagement.methods.productCount().call();
    const products = [];

    for (let i = 1; i <= productCount; i++) {
      try {
        const product = await supplyManagement.methods.getProduct(i).call();
        if (product[2] !== '0') {
          products.push({
            id: i,
            name: product[0],
            price: product[1],
            quantity: product[2],
          });
        }
      } catch (error) {
        // Tangani kesalahan jika produk tidak ditemukan
        console.error(`Gagal mengambil detail produk dengan ID ${i}:`, error);
      }
    }

    // Ambil produk dari MongoDB
    const dbProducts = await Product.find();

    res.render('index', { products, dbProducts });
  } catch (error) {
    console.error('Gagal mengambil daftar produk:', error);
    res.status(500).send('Gagal mengambil daftar produk. Silakan coba lagi nanti.');
  }
});

app.get('/product', async (req, res) => {
  try {
    const productCount = await supplyManagement.methods.productCount().call();
    const products = [];

    for (let i = 1; i <= productCount; i++) {
      try {
        const product = await supplyManagement.methods.getProduct(i).call();
        if (product[2] !== '0') {
          products.push({
            id: i,
            name: product[0],
            price: product[1],
            quantity: product[2],
          });
        }
      } catch (error) {
        // Tangani kesalahan jika produk tidak ditemukan
        console.error(`Gagal mengambil detail produk dengan ID ${i}:`, error);
      }
    }

    // Ambil produk dari MongoDB
    const dbProducts = await Product.find();

    res.render('productList', { products, dbProducts });
  } catch (error) {
    console.error('Gagal mengambil daftar produk:', error);
    res.status(500).send('Gagal mengambil daftar produk. Silakan coba lagi nanti.');
  }
});

app.post('/products/:smartContractId/update', async (req, res) => {
  const smartContractId = parseInt(req.params.smartContractId);
  const { name, price, quantity } = req.body;
  const accounts = await web3.eth.getAccounts();

  try {
    // Periksa apakah produk dengan smartContractId ada dalam kontrak pintar
    const product = await supplyManagement.methods.getProduct(smartContractId).call();
    if (product[2] === '0') {
      // Produk tidak ditemukan dalam kontrak pintar
      return res.status(404).send('Produk tidak ditemukan');
    }

    // Estimasi gas yang diperlukan untuk transaksi
    const gas = await supplyManagement.methods.updateProduct(smartContractId, name, price, quantity).estimateGas({ from: accounts[0] });

    // Tentukan batas gas yang lebih tinggi
    const gasLimit = Math.ceil(gas * 1.2); // Tingkatkan batas gas sebesar 20%

    // Perbarui produk dalam kontrak pintar dengan batas gas yang lebih tinggi
    await supplyManagement.methods.updateProduct(smartContractId, name, price, quantity).send({ from: accounts[0], gas: gasLimit });

    // Perbarui produk dalam MongoDB
    const mongoId = await getMongoIdFromSmartContractId(smartContractId);
    await Product.findByIdAndUpdate(mongoId, { name, price, quantity });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal memperbarui produk:', error);
    res.status(500).send('Gagal memperbarui produk');
  }
});


app.post('/products/:smartContractId/delete', async (req, res) => {
  const smartContractId = parseInt(req.params.smartContractId);
  const accounts = await web3.eth.getAccounts();

  try {
    // Periksa apakah produk dengan smartContractId ada dalam kontrak pintar
    const product = await supplyManagement.methods.getProduct(smartContractId).call();
    if (product[2] === '0') {
      // Produk tidak ditemukan dalam kontrak pintar
      return res.status(404).send('Produk tidak ditemukan');
    }

    // Hapus produk dari kontrak pintar
    await supplyManagement.methods.deleteProduct(smartContractId).send({ from: accounts[0] });

    // Hapus produk dari MongoDB
    const mongoId = await getMongoIdFromSmartContractId(smartContractId);
    await Product.findByIdAndDelete(mongoId);
    await ProductIdMapping.findOneAndDelete({ mongoId });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal menghapus produk:', error);
    res.status(500).send('Gagal menghapus produk. Silakan coba lagi nanti.');
  }
});


app.post('/products', async (req, res) => {
  const { name, price, quantity } = req.body;
  const accounts = await web3.eth.getAccounts();

  try {
    // Fetch and increment the counter
    const counter = await Counter.findOneAndUpdate(
      { name: 'productId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const id = counter.seq; // Use the incremented sequence number as the product ID

    // Estimate gas needed for the transaction
    const gas = await supplyManagement.methods.addProduct(name, price, quantity).estimateGas({ from: accounts[0] });

    // Set a higher gas limit
    const gasLimit = Math.ceil(gas * 1.2); // Increase gas limit by 20%

    // Add product to smart contract with higher gas limit
    const result = await supplyManagement.methods.addProduct(name, price, quantity).send({ from: accounts[0], gas: gasLimit });

    // Save new product to MongoDB
    const product = new Product({ name, price, quantity });
    const savedProduct = await product.save();

    // Save product ID mapping
    const smartContractId = result.events.ProductAdded.returnValues.id;
    await saveProductIdMapping(smartContractId, savedProduct._id);

    res.redirect('/');
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Error adding product');
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
