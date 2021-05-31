const DragonLair = artifacts.require("DragonLair");

module.exports = function (deployer, network) {

  deployer.deploy(DragonLair, '0x831753dd7087cac61ab5644b308642cc1c33dc13');
};