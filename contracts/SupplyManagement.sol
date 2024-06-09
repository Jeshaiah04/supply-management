// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SupplyManagement {
    address public owner;
    uint256 public productCount;
    uint256 public orderCount;

    struct Product {
        uint256 id;
        string name;
        uint256 price;
        uint256 quantity;
        bool exists;
    }

    struct Order {
        uint256 id;
        uint256 productId;
        uint256 quantity;
        address buyer;
        bool fulfilled;
    }

    mapping(uint256 => Product) public products;
    mapping(uint256 => Order) public orders;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    event ProductAdded(uint256 id, string name, uint256 price, uint256 quantity);
    event ProductUpdated(uint256 id, string name, uint256 price, uint256 quantity);
    event ProductDeleted(uint256 id);
    event OrderPlaced(uint256 orderId, uint256 productId, uint256 quantity, address buyer);
    event OrderFulfilled(uint256 orderId);

    constructor() {
        owner = msg.sender;
    }

    function addProduct(string memory _name, uint256 _price, uint256 _quantity) public onlyOwner {
        productCount++;
        products[productCount] = Product(productCount, _name, _price, _quantity, true);
        emit ProductAdded(productCount, _name, _price, _quantity);
    }

    function updateProduct(uint256 _productId, string memory _name, uint256 _price, uint256 _quantity) public onlyOwner {
        require(products[_productId].exists, "Product does not exist");
        Product storage product = products[_productId];
        product.name = _name;
        product.price = _price;
        product.quantity = _quantity;
        emit ProductUpdated(_productId, _name, _price, _quantity);
    }

    function deleteProduct(uint256 _productId) public onlyOwner {
        require(products[_productId].exists, "Product does not exist");
        delete products[_productId];
        emit ProductDeleted(_productId);
    }

    function getProduct(uint256 _productId) public view returns (string memory, uint256, uint256) {
        require(products[_productId].exists, "Product does not exist");
        Product storage product = products[_productId];
        return (product.name, product.price, product.quantity);
    }

    function placeOrder(uint256 _productId, uint256 _quantity) public {
        require(products[_productId].exists, "Product does not exist");
        require(products[_productId].quantity >= _quantity, "Insufficient product quantity");

        orderCount++;
        orders[orderCount] = Order(orderCount, _productId, _quantity, msg.sender, false);
        products[_productId].quantity -= _quantity;
        emit OrderPlaced(orderCount, _productId, _quantity, msg.sender);
    }

    function fulfillOrder(uint256 _orderId) public onlyOwner {
        require(_orderId > 0 && _orderId <= orderCount, "Invalid order ID");
        Order storage order = orders[_orderId];
        require(!order.fulfilled, "Order already fulfilled");
        order.fulfilled = true;
        emit OrderFulfilled(_orderId);
    }

    function getOrder(uint256 _orderId) public view returns (uint256, uint256, address, bool) {
        require(_orderId > 0 && _orderId <= orderCount, "Invalid order ID");
        Order storage order = orders[_orderId];
        return (order.productId, order.quantity, order.buyer, order.fulfilled);
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
}