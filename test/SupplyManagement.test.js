const { expect } = require("chai");
const hre = require("hardhat");

describe("SupplyManagement", function () {
  let SupplyManagement;
  let supplyManagement;
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    SupplyManagement = await hre.ethers.getContractFactory("SupplyManagement");
    [owner, addr1, addr2] = await hre.ethers.getSigners();
    supplyManagement = await SupplyManagement.deploy();
    await supplyManagement.deployed();
  });

  it("should add a product", async function () {
    await supplyManagement.addProduct("Product 1", 100, 10);
    expect(await supplyManagement.productCount()).to.equal(1);

    const product = await supplyManagement.getProduct(1);
    expect(product[0]).to.equal("Product 1");
    expect(product[1]).to.equal(100);
    expect(product[2]).to.equal(10);
  });

  it("should update a product", async function () {
    await supplyManagement.addProduct("Product 1", 100, 10);
    await supplyManagement.updateProduct(1, "Updated Product", 200, 20);

    const product = await supplyManagement.getProduct(1);
    expect(product[0]).to.equal("Updated Product");
    expect(product[1]).to.equal(200);
    expect(product[2]).to.equal(20);
  });

  it("should remove a product", async function () {
    await supplyManagement.addProduct("Product 1", 100, 10);
    await supplyManagement.deleteProduct(1);
    expect(await supplyManagement.productCount()).to.equal(1);

    await expect(supplyManagement.getProduct(1)).to.be.revertedWith(
      "Product does not exist"
    );
  });

  it("should place an order", async function () {
    await supplyManagement.addProduct("Product 1", 100, 10);
    await supplyManagement.connect(addr1).placeOrder(1, 5);
    expect(await supplyManagement.orderCount()).to.equal(1);

    const order = await supplyManagement.getOrder(1);
    expect(order[0]).to.equal(1);
    expect(order[1]).to.equal(5);
    expect(order[2]).to.equal(addr1.address);
    expect(order[3]).to.equal(false);

    const product = await supplyManagement.getProduct(1);
    expect(product[2]).to.equal(5);
  });

  it("should fulfill an order", async function () {
    await supplyManagement.addProduct("Product 1", 100, 10);
    await supplyManagement.connect(addr1).placeOrder(1, 5);
    await supplyManagement.fulfillOrder(1);

    const order = await supplyManagement.getOrder(1);
    expect(order[3]).to.equal(true);
  });

  it("should transfer ownership", async function () {
    await supplyManagement.transferOwnership(addr1.address);
    expect(await supplyManagement.owner()).to.equal(addr1.address);
  });
});