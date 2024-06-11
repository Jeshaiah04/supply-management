require('./telegramBot');
const mongoose = require('mongoose');
const express = require('express');
const path = require('path');
const Web3 = require('web3');
const session = require('express-session');
const bcrypt = require('bcrypt');
const SupplyManagementArtifact = require('./artifacts/contracts/SupplyManagement.sol/SupplyManagement.json');
const Product = require('./models/product');
const ProductIdMapping = require('./models/ProductIdMapping');
const Counter = require('./models/counter');
const Order = require('./models/order');
const User = require('./models/user');
const connectDB = require('./database');



// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

const web3 = new Web3('HTTP://127.0.0.1:7545'); // Change to the appropriate Ganache URL
const contractAddress = '0x64b66C14f5B9A2C9191Eb4e14Cc2BE75a08289f5'; // Change to the appropriate contract address
const supplyManagement = new web3.eth.Contract(SupplyManagementArtifact.abi, contractAddress);

// Configure session
app.use(session({
  secret: 'your_secret_key', // Change to a stronger secret
  resave: false,
  saveUninitialized: true
}));

// Middleware for static files and URL encoding
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Set view engine
app.set('view engine', 'ejs');
app.set('views', './views');

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
    const { id, name, description, price, quantity, category, createdAt } = event.returnValues;
    await addProductHandler(id, name, description, price, quantity, category, createdAt);
  })
  .on('error', console.error);

supplyManagement.events.ProductUpdated()
  .on('data', async (event) => {
    const { id, name, description, price, quantity, category } = event.returnValues;
    await updateProductHandler(id, name, description, price, quantity, category);
  })
  .on('error', console.error);

supplyManagement.events.ProductDeleted()
  .on('data', async (event) => {
    const { id } = event.returnValues;
    await deleteProductHandler(id);
  })
  .on('error', console.error);

supplyManagement.events.OrderPlaced()
  .on('data', async (event) => {
    const { id, productId, quantity, buyer, status } = event.returnValues;
    await addOrderHandler(id, productId, quantity, buyer, status);
  })
  .on('error', console.error);

supplyManagement.events.OrderFulfilled()
  .on('data', async (event) => {
    const { id, status } = event.returnValues;
    await updateOrderHandler(id, status);
  })
  .on('error', console.error);

// Middleware for session verification
function auth(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    res.render('login');
  }
}

// Middleware for role verification
function isOwner(req, res, next) {
  if (req.session.user && req.session.user.role === 'owner') {
    next();
  } else {
    res.status(403).send('Forbidden: Only owners can perform this action');
  }
}

// Route to display products and orders (accessible to all authenticated users)
app.get('/', auth, async (req, res) => {
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
            description: product[1],
            price: product[2],
            quantity: product[3],
            category: product[4],
            createdAt: product[5]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ID ${i}:`, error);
      }
    }

    const orderCount = await supplyManagement.methods.orderCount().call();
    const orders = [];
    for (let i = 1; i <= orderCount; i++) {
      try {
        const order = await supplyManagement.methods.getOrder(i).call();
        if (order[2] !== '0x0000000000000000000000000000000000000000') {
          orders.push({
            id: i,
            productId: order[0],
            quantity: order[1],
            buyer: order[2],
            status: order[3]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch order details for ID ${i}:`, error);
      }
    }

    res.render('home', { products, orders });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data. Please try again later.');
  }
});

// Handler functions
async function addProductHandler(id, name, description, price, quantity, category, createdAt) {
  const product = new Product({
    name,
    description,
    price,
    quantity,
    category,
    createdAt
  });
  const savedProduct = await product.save();

  await saveProductIdMapping(id, savedProduct._id);
}

async function updateProductHandler(id, name, description, price, quantity, category) {
  const mongoId = await getMongoIdFromSmartContractId(id);
  await Product.findByIdAndUpdate(mongoId, { name, description, price, quantity, category });
}

async function deleteProductHandler(id) {
  const mongoId = await getMongoIdFromSmartContractId(id);
  await Product.findByIdAndDelete(mongoId);
  await ProductIdMapping.findOneAndDelete({ smartContractId: id });
}

async function addOrderHandler(id, productId, quantity, buyer, status) {
  const order = new Order({
    orderId: id,
    productId,
    quantity,
    buyer,
    status
  });
  await order.save();
}

async function updateOrderHandler(id, status) {
  await Order.findOneAndUpdate({ orderId: id }, { status });
}

// Route for user registration
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  const accounts = await web3.eth.getAccounts();

  try {
    // Dapatkan alamat berdasarkan urutan di Ganache
    const userCount = await User.countDocuments();
    const userAddress = accounts[userCount];

    // Simpan pengguna ke MongoDB
    const user = new User({ username, password, userAddress, role });
    await user.save();
    console.log('User registered successfully');

    res.send('User registered successfully');
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).send('Error registering user');
  }
});

// Route for user login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).send('User not found');
    }

    user.comparePassword(password, (err, isMatch) => {
      if (err) {
        return res.status(500).send('Error comparing password');
      }

      if (!isMatch) {
        return res.status(401).send('Incorrect password');
      }

      // Set session user
      req.session.user = { userAddress: user.userAddress, role: user.role };
      res.redirect('/');
    });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('Error logging in');
  }
});

// Route to display register form
app.get('/register', (req, res) => {
  res.render('register');
});

// Route to display login form
app.get('/login', (req, res) => {
  res.render('login');
});

// Route to display user profile
app.get('/profile', auth, (req, res) => {
  res.render('profile', { user: req.session.user });
});

// Route for user logout
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Failed to logout');
    }
    res.redirect('/login');
  });
});

// Route to add a new product (only for store owners)
app.post('/products', auth, isOwner, async (req, res) => {
  const { name, description, price, quantity, category } = req.body;
  const userAddress = req.session.user.userAddress;

  try {
    const counter = await Counter.findOneAndUpdate(
      { name: 'productId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const id = counter.seq;
    const gas = await supplyManagement.methods.addProduct(name, description, price, quantity, category).estimateGas({ from: userAddress });
    const gasLimit = Math.ceil(gas * 1.2);

    const result = await supplyManagement.methods.addProduct(name, description, price, quantity, category).send({ from: userAddress, gas: gasLimit });

    const product = new Product({ name, description, price, quantity, category });
    const savedProduct = await product.save();

    const smartContractId = result.events.ProductAdded.returnValues.id;
    await saveProductIdMapping(smartContractId, savedProduct._id);

    res.redirect('/');
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).send('Error adding product');
  }
});

// Route to update a product (only for store owners)
app.post('/products/:smartContractId/update', auth, isOwner, async (req, res) => {
  const smartContractId = parseInt(req.params.smartContractId);
  const { name, description, price, quantity, category } = req.body;
  const userAddress = req.session.user.userAddress;

  try {
    const product = await supplyManagement.methods.getProduct(smartContractId).call();
    if (product[2] === '0') {
      return res.status(404).send('Produk tidak ditemukan');
    }

    const gas = await supplyManagement.methods.updateProduct(smartContractId, name, description, price, quantity, category).estimateGas({ from: userAddress });
    const gasLimit = Math.ceil(gas * 1.2);

    await supplyManagement.methods.updateProduct(smartContractId, name, description, price, quantity, category).send({ from: userAddress, gas: gasLimit });

    const mongoId = await getMongoIdFromSmartContractId(smartContractId);
    await Product.findByIdAndUpdate(mongoId, { name, description, price, quantity, category });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal memperbarui produk:', error);
    res.status(500).send('Gagal memperbarui produk');
  }
});

// Route to delete a product (only for store owners)
app.post('/products/:smartContractId/delete', auth, isOwner, async (req, res) => {
  const smartContractId = parseInt(req.params.smartContractId);
  const userAddress = req.session.user.userAddress;

  try {
    const product = await supplyManagement.methods.getProduct(smartContractId).call();
    if (product[2] === '0') {
      return res.status(404).send('Produk tidak ditemukan');
    }

    await supplyManagement.methods.deleteProduct(smartContractId).send({ from: userAddress });

    const mongoId = await getMongoIdFromSmartContractId(smartContractId);
    await Product.findByIdAndDelete(mongoId);
    await ProductIdMapping.findOneAndDelete({ mongoId });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal menghapus produk:', error);
    res.status(500).send('Gagal menghapus produk. Silakan coba lagi nanti.');
  }
});

// Route to place a new order (accessible to all authenticated users)
app.post('/orders', auth, async (req, res) => {
  const { productName, quantity } = req.body;
  const userAddress = req.session.user.userAddress;

  try {
    console.log('Mencari ID produk berdasarkan nama:', productName);
    const productId = await supplyManagement.methods.getProductIdByName(productName).call();
    console.log('ID produk yang ditemukan:', productId);

    if (productId === 0) {
      console.error('Produk tidak ditemukan di kontrak pintar:', productName);
      return res.status(404).send('Produk tidak ditemukan di kontrak pintar');
    }

    console.log('Estimasi gas untuk placeOrder');
    const gas = await supplyManagement.methods.placeOrder(productName, quantity).estimateGas({ from: userAddress });
    const gasLimit = Math.ceil(gas * 1.2);
    console.log('Gas limit yang digunakan:', gasLimit);

    console.log('Mengirim transaksi placeOrder');
    const result = await supplyManagement.methods.placeOrder(productName, quantity).send({ from: userAddress, gas: gasLimit });
    console.log('Transaksi placeOrder berhasil:', result);

    const orderId = result.events.OrderPlaced.returnValues.orderId;
    console.log('Order ID dari event:', orderId);

    const order = new Order({
      orderId: orderId,
      productName,
      quantity,
      buyer: userAddress,
      status: 'pending'
    });
    await order.save();
    console.log('Order berhasil disimpan di database');

    res.redirect('/');
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).send('Error placing order');
  }
});

// Route to update an order (accessible to all authenticated users)
app.post('/orders/:orderId/update', auth, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const { status } = req.body;
  const userAddress = req.session.user.userAddress;

  try {
    const gas = await supplyManagement.methods.fulfillOrder(orderId, status).estimateGas({ from: userAddress });
    const gasLimit = Math.ceil(gas * 1.2);

    await supplyManagement.methods.fulfillOrder(orderId, status).send({ from: userAddress, gas: gasLimit });

    await Order.findOneAndUpdate({ orderId }, { status });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal memperbarui order:', error);
    res.status(500).send('Gagal memperbarui order');
  }
});

// Route to delete an order (accessible to all authenticated users)
app.post('/orders/:orderId/delete', auth, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const userAddress = req.session.user.userAddress;

  try {
    await supplyManagement.methods.deleteOrder(orderId).send({ from: userAddress });

    await Order.findOneAndDelete({ orderId });

    res.redirect('/');
  } catch (error) {
    console.error('Gagal menghapus order:', error);
    res.status(500).send('Gagal menghapus order. Silakan coba lagi nanti.');
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

    res.render('shop', { products, dbProducts });
  } catch (error) {
    console.error('Gagal mengambil daftar produk:', error);
    res.status(500).send('Gagal mengambil daftar produk. Silakan coba lagi nanti.');
  }
});

app.get('/productmanagement', async (req, res) => {
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
            description: product[1],
            price: product[2],
            quantity: product[3],
            category: product[4],
            createdAt: product[5]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ID ${i}:`, error);
      }
    }

    const orderCount = await supplyManagement.methods.orderCount().call();
    const orders = [];
    for (let i = 1; i <= orderCount; i++) {
      try {
        const order = await supplyManagement.methods.getOrder(i).call();
        if (order[2] !== '0x0000000000000000000000000000000000000000') {
          orders.push({
            id: i,
            productId: order[0],
            quantity: order[1],
            buyer: order[2],
            status: order[3]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch order details for ID ${i}:`, error);
      }
    }

    res.render('productList', { products, orders });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data. Please try again later.');
  }
});

app.get('/product-management', auth, async (req, res) => {
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
            description: product[1],
            price: product[2],
            quantity: product[3],
            category: product[4],
            createdAt: product[5]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ID ${i}:`, error);
      }
    }

    const orderCount = await supplyManagement.methods.orderCount().call();
    const orders = [];
    for (let i = 1; i <= orderCount; i++) {
      try {
        const order = await supplyManagement.methods.getOrder(i).call();
        if (order[2] !== '0x0000000000000000000000000000000000000000') {
          orders.push({
            id: i,
            productId: order[0],
            quantity: order[1],
            buyer: order[2],
            status: order[3]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch order details for ID ${i}:`, error);
      }
    }

    res.render('productList', { products, orders });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data. Please try again later.');
  }
});

app.get('/shop', auth, async (req, res) => {
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
            description: product[1],
            price: product[2],
            quantity: product[3],
            category: product[4],
            createdAt: product[5]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ID ${i}:`, error);
      }
    }

    const orderCount = await supplyManagement.methods.orderCount().call();
    const orders = [];
    for (let i = 1; i <= orderCount; i++) {
      try {
        const order = await supplyManagement.methods.getOrder(i).call();
        if (order[2] !== '0x0000000000000000000000000000000000000000') {
          orders.push({
            id: i,
            productId: order[0],
            quantity: order[1],
            buyer: order[2],
            status: order[3]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch order details for ID ${i}:`, error);
      }
    }

    res.render('shop', { products, orders });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data. Please try again later.');
  }
});

app.get('/order', auth, async (req, res) => {
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
            description: product[1],
            price: product[2],
            quantity: product[3],
            category: product[4],
            createdAt: product[5]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ID ${i}:`, error);
      }
    }

    const orderCount = await supplyManagement.methods.orderCount().call();
    const orders = [];
    for (let i = 1; i <= orderCount; i++) {
      try {
        const order = await supplyManagement.methods.getOrder(i).call();
        if (order[2] !== '0x0000000000000000000000000000000000000000') {
          orders.push({
            id: i,
            productId: order[0],
            quantity: order[1],
            buyer: order[2],
            status: order[3]
          });
        }
      } catch (error) {
        console.error(`Failed to fetch order details for ID ${i}:`, error);
      }
    }

    res.render('order', { products, orders });
  } catch (error) {
    console.error('Failed to fetch data:', error);
    res.status(500).send('Failed to fetch data. Please try again later.');
  }
});

app.get('/contact', auth, (req, res) => {
  res.render('contact', { user: req.session.user });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
