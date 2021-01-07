pragma solidity >=0.5.0;

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

// a library for performing overflow-safe math, courtesy of DappHub (https://github.com/dapphub/ds-math)

library SafeMath {
    function add(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x + y) >= x, 'ds-math-add-overflow');
    }

    function sub(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require((z = x - y) <= x, 'ds-math-sub-underflow');
    }

    function mul(uint256 x, uint256 y) internal pure returns (uint256 z) {
        require(y == 0 || (z = x * y) / y == x, 'ds-math-mul-overflow');
    }
}
library UniswapV3Lib {
    using SafeMath for uint256;

    function checkAndConvertETHToWETH(address token) internal pure returns(address) {
        
        if(token == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)) {
            return address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
        }
        return token;
    }

    // returns sorted token addresses, used to handle return values from pairs sorted in this order
    function sortTokens(address tokenA, address tokenB) internal pure returns (address, address) {
        tokenA = checkAndConvertETHToWETH(tokenA);
        tokenB = checkAndConvertETHToWETH(tokenB);
        return(tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA));
    }

    // calculates the CREATE2 address for a pair without making any external calls
    function pairFor(address factory, address tokenA, address tokenB) internal pure returns (address) {
        (address token0, address token1) = sortTokens(tokenA, tokenB);
        return(address(uint(keccak256(abi.encodePacked(
                hex'ff',
                factory,
                keccak256(abi.encodePacked(token0, token1)),
                hex'96e8ac4277198ff8b6f785478aa9a39f403cb768dd02cbee326c3e7da348845f' // init code hash
            )))));
    }

    function getReservesByPair(address pair, address tokenA, address tokenB) internal view returns (uint112 reserveA, uint112 reserveB) {
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal pure returns (uint112 amountOut) {
        require(amountIn > 0, 'UniswapV2Library: INSUFFICIENT_INPUT_AMOUNT');
        uint256 amountInWithFee = amountIn.mul(997);
        uint256 numerator = amountInWithFee.mul(reserveOut);
        uint256 denominator = reserveIn.mul(1000).add(amountInWithFee);
        amountOut = uint112(numerator / denominator);
    }

    function getAmountOutByPair(uint112 amountIn, address pair, address tokenA, address tokenB) internal view returns(uint112 amountOut) {
        (uint112 reserveIn, uint112 reserveOut) = getReservesByPair(pair, tokenA, tokenB);
        return (getAmountOut(amountIn, reserveIn, reserveOut));
    }
}
