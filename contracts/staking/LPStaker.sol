pragma solidity =0.6.12;

import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IStakingRewards.sol';
import './interfaces/IStakingRewardsFactory.sol';


/** 
    This contract allows QuickSwap Router contract to stake LP tokens on behalf of users.
    It keeps track of user staked LP tokens via router and the corresponding state.
    Use this contract for only non-fee based reward token like QUICK/DQUICK
*/
contract LPStaker {
    using SafeMath for uint256;

    address public router;
    address immutable public stakingRewardsFactory;

    mapping(address => mapping(address=>uint256)) private userVsPoolVsbalances;

    mapping(address => mapping(address=>uint256)) public userVsPoolVsRewardPerTokenPaid;

    mapping(address => mapping(address=>uint256)) public userVsPoolVsRewards;

    event LPStaked(
        address indexed user,
        address indexed pool,
        uint256 amount
    );

    event LPWithdrawn(
        address indexed user,
        address indexed pool,
        uint256 amount
    );

    event LPRewardPaid(
        address indexed user,
        address indexed pool,
        uint256 rewards
    );

    modifier onlyRouterOrUser(address user) {
        require(msg.sender == router || msg.sender == user, "Access denied");
        _;
    }

    modifier onlyRouter() {
        require(msg.sender == router, "Access denied");
        _;
    }

    constructor(address _stakingRewardsFactory) public {
        stakingRewardsFactory = _stakingRewardsFactory;
    }

    //Only Router contract can set this field
    function setRouter() external {
        require(router == address(0), "Router already set");
        router = msg.sender;
    }

    function balanceOf(address user, address pool) external view returns (uint256) {
        return userVsPoolVsbalances[user][pool];
    }

    function stake(address user, address pool, uint256 amount) external onlyRouter {
        address stakingRewardsAddress = updateReward(user, pool);
        
        IStakingRewards stakingRewards = IStakingRewards(stakingRewardsAddress);

        userVsPoolVsbalances[user][pool] = userVsPoolVsbalances[user][pool].add(amount);

        TransferHelper.safeApprove(pool, stakingRewardsAddress, amount);
        stakingRewards.stake(amount);

        emit LPStaked(user, pool, amount);
    }

    function withdraw(address user, address pool, uint256 amount) external onlyRouterOrUser(user) {
        address stakingRewardsAddress = updateReward(user, pool);
 
        IStakingRewards stakingRewards = IStakingRewards(stakingRewardsAddress);

        userVsPoolVsbalances[user][pool] = userVsPoolVsbalances[user][pool].sub(amount);

        stakingRewards.withdraw(amount);

        TransferHelper.safeTransfer(pool, msg.sender, amount);

        emit LPWithdrawn(
            user,
            pool,
            amount
        );
    }

    function getReward(address user, address pool) external onlyRouterOrUser(user) returns(address, uint256){

        address stakingRewardsAddress = updateReward(user, pool);
        
        IStakingRewards stakingRewards = IStakingRewards(stakingRewardsAddress);

        uint256 reward = userVsPoolVsRewards[user][pool];

        address rewardToken = stakingRewards.rewardsToken();

        if (reward > 0) {
            userVsPoolVsRewards[user][pool] = 0;

            stakingRewards.getReward();
            
            TransferHelper.safeTransfer(rewardToken, msg.sender, reward);

            emit LPRewardPaid(user, pool, reward);

            return (rewardToken, reward);
        }

        return (rewardToken, reward);
    }

    function earned(address user, address pool) public view returns (uint256) {
        (address stakingRewardsAddress, , ) = IStakingRewardsFactory(stakingRewardsFactory).stakingRewardsInfoByStakingToken(pool);

        if (stakingRewardsAddress == address(0)) {
            return 0;
        }
        
        IStakingRewards stakingRewards = IStakingRewards(stakingRewardsAddress);

        return userVsPoolVsbalances[user][pool].mul(
            stakingRewards.rewardPerToken().sub(userVsPoolVsRewardPerTokenPaid[user][pool])
        ).div(1e18).add(userVsPoolVsRewards[user][pool]);
    }

    function updateReward(address user, address pool) private returns(address) {
        (address stakingRewardsAddress, , ) = IStakingRewardsFactory(stakingRewardsFactory).stakingRewardsInfoByStakingToken(pool);

        require(stakingRewardsAddress != address(0), "No staking rewards exists for the given pool");
        
        IStakingRewards stakingRewards = IStakingRewards(stakingRewardsAddress);

        if (user != address(0)) {
            userVsPoolVsRewards[user][pool] = earned(user, pool);
            userVsPoolVsRewardPerTokenPaid[user][pool] = stakingRewards.rewardPerTokenStored();
        }

        return stakingRewardsAddress;
    }
}