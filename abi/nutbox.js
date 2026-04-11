const NUTBOX_COMMUNITY_ABI = [
  'function committee() view returns (address)',
  'function feeRatio() view returns (uint16)',
  'function rewardCalculator() view returns (address)',
  'function communityToken() view returns (address)',
  'function owner() view returns (address)',
  'function activedPools(uint256) view returns (address)',
  'function createdPools(uint256) view returns (address)',
  'function poolActived(address pool) view returns (bool)',
  'function getPoolPendingRewards(address poolAddress, address user) view returns (uint256)',
  'function getTotalPendingRewards(address user) view returns (uint256)',
  'function adminAddPool(string poolName, uint16[] ratios, address poolFactory, bytes meta) payable',
  'function adminSetPoolRatios(uint16[] ratios) payable',
  'function withdrawPoolsRewards(address[] poolAddresses) payable'
]

const NUTBOX_POOL_ABI = [
  'function name() view returns (string)',
  'function getFactory() view returns (address)',
  'function getCommunity() view returns (address)',
  'function getUserStakedAmount(address user) view returns (uint256)',
  'function getTotalStakedAmount() view returns (uint256)'
]

const ERC20_STAKING_POOL_ABI = [
  ...NUTBOX_POOL_ABI,
  'function stakeToken() view returns (address)',
  'function getUserDepositInfo(address user) view returns (tuple(bool hasDeposited, uint256 amount))',
  'function deposit(uint256 amount) payable',
  'function withdraw(uint256 amount) payable'
]

const ERC20_LOCKING_POOL_ABI = [
  ...NUTBOX_POOL_ABI,
  'function stakeToken() view returns (address)',
  'function lockDuration() view returns (uint256)',
  'function getUserDepositInfo(address user) view returns (tuple(bool hasDeposited, uint256 amount))',
  'function claimableAmount(address user) view returns (uint256)',
  'function redeemRequestCount(address user) view returns (uint256)',
  'function redeemRequests(address user) view returns (tuple(uint256 erc20Amount, uint256 claimed, uint256 startTime, uint256 endTime)[])',
  'function deposit(uint256 amount) payable',
  'function withdraw(uint256 amount) payable',
  'function redeem()'
]

const ERC1155_STAKING_POOL_ABI = [
  ...NUTBOX_POOL_ABI,
  'function stakeToken() view returns (address)',
  'function tokenId() view returns (uint256)',
  'function getUserDepositInfo(address user) view returns (tuple(bool hasDeposited, uint256 amount))',
  'function deposit(uint256 amount) payable',
  'function withdraw(uint256 amount) payable'
]

const SOCIAL_CURATION_POOL_ABI = [
  ...NUTBOX_POOL_ABI,
  'function totalClaimed() view returns (uint256)',
  'function claim(uint256 orderId, uint256 amount, uint256 deadline, bytes signature) payable',
  'function harvestRewards() payable'
]

const NUTBOX_COMMITTEE_ABI = [
  'function getCreateCommunityFee() view returns (uint256)',
  'function getCommunitySettingsFee() view returns (uint256)',
  'function getPoolOperationFee() view returns (uint256)',
  'function getFeeRecipient() view returns (address)',
  'function verifyContract(address factory) view returns (bool)'
]

const ERC1155_APPROVAL_ABI = [
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)'
]

export {
  NUTBOX_COMMUNITY_ABI,
  NUTBOX_POOL_ABI,
  ERC20_STAKING_POOL_ABI,
  ERC20_LOCKING_POOL_ABI,
  ERC1155_STAKING_POOL_ABI,
  SOCIAL_CURATION_POOL_ABI,
  NUTBOX_COMMITTEE_ABI,
  ERC1155_APPROVAL_ABI
}
