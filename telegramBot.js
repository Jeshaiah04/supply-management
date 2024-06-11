const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
const SupplyManagementArtifact = require('./artifacts/contracts/SupplyManagement.sol/SupplyManagement.json');
const Product = require('./models/product');
const ProductIdMapping = require('./models/ProductIdMapping');

const token = '7292794381:AAEYIZXkdb3ljL_-ainkzFuvoD0iU1Z0hcA';
const web3 = new Web3('HTTP://127.0.0.1:7545');
const contractAddress = '0x64b66C14f5B9A2C9191Eb4e14Cc2BE75a08289f5';
const supplyManagement = new web3.eth.Contract(SupplyManagementArtifact.abi, contractAddress);

const bot = new TelegramBot(token, { polling: true });

const welcomeMessage = `
Selamat datang di Supply Management Bot!

Berikut adalah perintah yang tersedia:
/products - Melihat daftar produk
/add - Menambahkan produk baru
/delete - Menghapus produk

Silakan pilih perintah yang ingin Anda jalankan.
`;

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, welcomeMessage);
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  const products = await Product.find();

  let response = 'Daftar Produk:\n\n';
  for (const product of products) {
    response += `ID: ${product._id}\nNama: ${product.name}\nDeskripsi: ${product.description}\nHarga: ${product.price}\nJumlah: ${product.quantity}\nKategori: ${product.category}\n\n`;
  }

  await bot.sendMessage(chatId, response);
});

bot.onText(/\/add/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Silakan masukkan detail produk dalam format: /add_product <nama> <deskripsi> <harga> <jumlah> <kategori>');
});

bot.onText(/\/add_product (.+) (.+) (\d+) (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1];
  const description = match[2];
  const price = parseInt(match[3]);
  const quantity = parseInt(match[4]);
  const category = match[5];

  try {
    const accounts = await web3.eth.getAccounts();
    const gas = await supplyManagement.methods.addProduct(name, description, price, quantity, category).estimateGas({ from: accounts[0] });
    const gasLimit = Math.ceil(gas * 1.2);

    await supplyManagement.methods.addProduct(name, description, price, quantity, category).send({ from: accounts[0], gas: gasLimit });

    const product = new Product({ name, description, price, quantity, category });
    await product.save();

    await bot.sendMessage(chatId, 'Produk berhasil ditambahkan!');
  } catch (error) {
    console.error('Gagal menambahkan produk:', error);
    await bot.sendMessage(chatId, 'Terjadi kesalahan saat menambahkan produk. Silakan coba lagi nanti.');
  }
});

bot.onText(/\/delete_product (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const mongoId = match[1];

  try {
    const smartContractId = await getSmartContractIdFromMongoId(mongoId);

    if (!smartContractId) {
      await bot.sendMessage(chatId, 'Produk tidak ditemukan!');
      return;
    }

    const accounts = await web3.eth.getAccounts();
    const gas = await supplyManagement.methods.deleteProduct(smartContractId).estimateGas({ from: accounts[0] });
    const gasLimit = Math.ceil(gas * 1.2);

    await supplyManagement.methods.deleteProduct(smartContractId).send({ from: accounts[0], gas: gasLimit });

    await Product.findByIdAndDelete(mongoId);
    await ProductIdMapping.findOneAndDelete({ mongoId });

    await bot.sendMessage(chatId, 'Produk berhasil dihapus!');
  } catch (error) {
    console.error('Gagal menghapus produk:', error);
    await bot.sendMessage(chatId, 'Terjadi kesalahan saat menghapus produk. Silakan coba lagi nanti.');
  }
});

async function getSmartContractIdFromMongoId(mongoId) {
  const idMapping = await ProductIdMapping.findOne({ mongoId });
  return idMapping ? idMapping.smartContractId : null;
}

async function refreshBotLogs() {
  try {
    await TelegramBot.clearTextListener();
    await TelegramBot.clearReplyListeners();
    await TelegramBot.clearCallbackQueryListeners();

    console.log('Log bot berhasil di-refresh.');
  } catch (error) {
    console.error('Gagal melakukan refresh log bot:', error);
  }
}

refreshBotLogs();
