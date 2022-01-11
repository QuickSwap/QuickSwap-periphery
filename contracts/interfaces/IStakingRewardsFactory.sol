pragma solidity =0.6.12;


interface IStakingRewardsFactory {

    function rewardsToken() external view returns(address);

    function stakingRewardsInfoByStakingToken(address pool) external view returns(address stakingRewards, uint rewardAmount, uint duration);
}