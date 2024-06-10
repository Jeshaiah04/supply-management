const TelegramBot = require('node-telegram-bot-api');
const Web3 = require('web3');
const SupplyManagementArtifact = require('./artifacts/contracts/SupplyManagement.sol/SupplyManagement.json');
const Product = require('./models/product');

const token = '7295092624:AAG8ntYZuOC6_OdTWQGGxG17qaG-JJApq0Y'; //Sesuaikan dengan telegram bot tokennya
const web3 = new Web3('HTTP://127.0.0.1:7545');
const contractAddress = '0x63Ea19f041A4D284EAC386Cc93f535655a7ADe00'; //Sesuaikan dengan Kontrak Address Masing2
const supplyManagement = new web3.eth.Contract(SupplyManagementArtifact.abi, contractAddress);

const bot = new TelegramBot(token, { polling: true });

// Pesan sambutan default
const welcomeMessage = `
Selamat datang di Supply Management Bot!

Berikut adalah perintah yang tersedia:
/products - Melihat daftar produk
/add - Menambahkan produk baru
/delete - Menghapus produk

Silakan pilih perintah yang ingin Anda jalankan.
`;

// Handler untuk perintah /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, welcomeMessage);
});

// Handler untuk setiap pesan yang diterima
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, welcomeMessage);
});

// Handler untuk perintah /products
bot.onText(/\/products/, async (msg) => {
  const chatId = msg.chat.id;
  const products = await Product.find();

  let response = 'Daftar Produk:\n\n';
  for (const product of products) {
    response += `ID: ${product._id}\nNama: ${product.name}\nHarga: ${product.price}\nJumlah: ${product.quantity}\n\n`;
  }

  await bot.sendMessage(chatId, response);
});

// Handler untuk perintah /add
bot.onText(/\/add/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 'Silakan masukkan detail produk dalam format: /add_product <nama> <harga> <jumlah>');
});

// Handler untuk perintah /add_product
bot.onText(/\/add_product (.+) (\d+) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = match[1];
  const price = parseInt(match[2]);
  const quantity = parseInt(match[3]);

  try {
    const accounts = await web3.eth.getAccounts();
    const gas = await supplyManagement.methods.addProduct(name, price, quantity).estimateGas({ from: accounts[0] });
    const gasLimit = Math.ceil(gas * 1.2); // Menambahkan 20% margin gas

    await supplyManagement.methods.addProduct(name, price, quantity).send({ from: accounts[0], gas: gasLimit });

    const product = new Product({ name, price, quantity });
    await product.save();

    await bot.sendMessage(chatId, 'Produk berhasil ditambahkan!');
  } catch (error) {
    console.error('Gagal menambahkan produk:', error);
    await bot.sendMessage(chatId, 'Terjadi kesalahan saat menambahkan produk. Silakan coba lagi nanti.');
  }
});

// Handler untuk perintah /delete_product
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
    const gasLimit = Math.ceil(gas * 1.2); // Menambahkan 20% margin gas

    await supplyManagement.methods.deleteProduct(smartContractId).send({ from: accounts[0], gas: gasLimit });

    await Product.findByIdAndDelete(mongoId);
    await ProductIdMapping.findOneAndDelete({ mongoId });

    await bot.sendMessage(chatId, 'Produk berhasil dihapus!');
  } catch (error) {
    console.error('Gagal menghapus produk:', error);
    await bot.sendMessage(chatId, 'Terjadi kesalahan saat menghapus produk. Silakan coba lagi nanti.');
  }
});

// Validasi refresh log bot
async function refreshBotLogs() {
  try {
    // Hapus log bot sebelumnya
    await TelegramBot.clearTextListener();
    await TelegramBot.clearReplyListeners();
    await TelegramBot.clearCallbackQueryListeners();

    console.log('Log bot berhasil di-refresh.');
  } catch (error) {
    console.error('Gagal melakukan refresh log bot:', error);
  }
}

// Panggil fungsi refreshBotLogs saat bot dinyalakan
refreshBotLogs();