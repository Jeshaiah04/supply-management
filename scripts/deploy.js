const hre = require("hardhat");

async function main() {
  const SupplyManagement = await hre.ethers.getContractFactory("SupplyManagement");
  const supplyManagement = await SupplyManagement.deploy();

  await supplyManagement.deployed();

  console.log("SupplyManagement deployed to:", supplyManagement.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });