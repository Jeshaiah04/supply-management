// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SupplyManagement {
    address public owner;
    uint256 public productCount;
    uint256 public orderCount;

    struct Product {
        uint256 id;
        string name;
        string description;
        uint256 price;
        uint256 quantity;
        string category;
        uint256 createdAt;
        bool exists;
    }

    struct Order {
        uint256 id;
        string productName;
        uint256 quantity;
        address buyer;
        bool fulfilled;
        string status;
    }

    struct User {
        address userAddress;
        string role; // "owner" atau "buyer"
    }

    mapping(uint256 => Product) public products;
    mapping(uint256 => Order) public orders;
    mapping(address => User) public users; // Pastikan ini dideklarasikan setelah struct User

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    event ProductAdded(uint256 id, string name, string description, uint256 price, uint256 quantity, string category, uint256 createdAt);
    event ProductUpdated(uint256 id, string name, string description, uint256 price, uint256 quantity, string category);
    event ProductDeleted(uint256 id);
    event OrderPlaced(uint256 orderId, string productName, uint256 quantity, address buyer, string status);
    event OrderFulfilled(uint256 orderId, string status);
    event OrderDeleted(uint256 orderId);
    event UserRegistered(address userAddress, string role);

    constructor() {
        owner = msg.sender;
    }

    function registerUser(address _userAddress, string memory _role) public {
        require(msg.sender == owner, "Only owner can register users");
        users[_userAddress] = User(_userAddress, _role);
        emit UserRegistered(_userAddress, _role);
    }

    function addProduct(string memory _name, string memory _description, uint256 _price, uint256 _quantity, string memory _category) public {
        require(keccak256(abi.encodePacked(users[msg.sender].role)) == keccak256(abi.encodePacked("owner")), "Only owner can add products");
        productCount++;
        uint256 _createdAt = block.timestamp;
        products[productCount] = Product(productCount, _name, _description, _price, _quantity, _category, _createdAt, true);
        emit ProductAdded(productCount, _name, _description, _price, _quantity, _category, _createdAt);
    }

    function updateProduct(uint256 _productId, string memory _name, string memory _description, uint256 _price, uint256 _quantity, string memory _category) public onlyOwner {
        require(products[_productId].exists, "Product does not exist");
        Product storage product = products[_productId];
        product.name = _name;
        product.description = _description;
        product.price = _price;
        product.quantity = _quantity;
        product.category = _category;
        emit ProductUpdated(_productId, _name, _description, _price, _quantity, _category);
    }

    function deleteProduct(uint256 _productId) public onlyOwner {
        require(products[_productId].exists, "Product does not exist");
        delete products[_productId];
        emit ProductDeleted(_productId);
    }

    function getProduct(uint256 _productId) public view returns (string memory, string memory, uint256, uint256, string memory, uint256) {
        require(products[_productId].exists, "Product does not exist");
        Product storage product = products[_productId];
        return (product.name, product.description, product.price, product.quantity, product.category, product.createdAt);
    }

    function getProductIdByName(string memory _name) public view returns (uint256) {
        for (uint256 i = 1; i <= productCount; i++) {
            if (keccak256(abi.encodePacked(products[i].name)) == keccak256(abi.encodePacked(_name))) {
                return i;
            }
        }
        return 0;
    }

    function placeOrder(string memory _productName, uint256 _quantity) public {
        uint256 productId = getProductIdByName(_productName);
        require(productId != 0, "Product does not exist");
        require(products[productId].quantity >= _quantity, "Insufficient product quantity");

        orderCount++;
        orders[orderCount] = Order(orderCount, _productName, _quantity, msg.sender, false, "pending");
        products[productId].quantity -= _quantity;
        emit OrderPlaced(orderCount, _productName, _quantity, msg.sender, "pending");
    }

    function fulfillOrder(uint256 _orderId, string memory _status) public onlyOwner {
        require(_orderId > 0 && _orderId <= orderCount, "Invalid order ID");
        Order storage order = orders[_orderId];
        require(!order.fulfilled, "Order already fulfilled");
        order.fulfilled = true;
        order.status = _status;
        emit OrderFulfilled(_orderId, _status);
    }

    function getOrder(uint256 _orderId) public view returns (string memory, uint256, address, bool, string memory) {
        require(_orderId > 0 && _orderId <= orderCount, "Invalid order ID");
        Order storage order = orders[_orderId];
        return (order.productName, order.quantity, order.buyer, order.fulfilled, order.status);
    }

    function deleteOrder(uint256 _orderId) public onlyOwner {
        require(_orderId > 0 && _orderId <= orderCount, "Invalid order ID");
        delete orders[_orderId];
        emit OrderDeleted(_orderId);
    }

    function transferOwnership(address _newOwner) public onlyOwner {
        require(_newOwner != address(0), "Invalid address");
        owner = _newOwner;
    }
}
