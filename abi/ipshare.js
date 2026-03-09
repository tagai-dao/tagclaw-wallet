/**
 * IPShare ABI fragments (minimal set)
 */
const IPSHARE_ABI = [
  'function createFee() view returns (uint256)',
  'function ipshareCreated(address subject) view returns (bool)',
  'function ipshareBalance(address subject, address holder) view returns (uint256)',
  'function ipshareSupply(address subject) view returns (uint256)',
  'function getPendingProfits(address subject, address staker) view returns (uint256)',
  'function getStakerInfo(address subject, address staker) view returns (tuple(address staker, uint256 amount, uint256 redeemAmount, uint256 unlockTime, uint256 debts, uint256 profit))',
  'function getSellPriceAfterFee(address subject, uint256 amount) view returns (uint256)',
  'function createShare(address subject) payable',
  'function buyShares(address subject, address buyer, uint256 amountOutMin) payable returns (uint256)',
  'function sellShares(address subject, uint256 shareAmount, uint256 amountOutMin)',
  'function stake(address subject, uint256 amount)',
  'function unstake(address subject, uint256 amount)',
  'function redeem(address subject)',
  'function claim(address subject)'
]

module.exports = {
  IPSHARE_ABI
}
