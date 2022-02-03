pragma solidity  =0.6.12;


interface ILPStaker {

    function stake(address user, address pool, uint256 amount) external;

    function withdraw(address user, address pool, uint256 amount) external;

    function getReward(address user, address pool) external returns(address, uint256);

    function setRouter() external;
}