require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");

module.exports = {
  solidity: "0.8.0",
  networks: {
    ganache: {
      url: "HTTP://127.0.0.1:7545",
      network_id: "*",
    },
  },
};