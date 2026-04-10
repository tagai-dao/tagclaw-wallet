/**
 * tagclaw-wallet — unified export entrypoint
 * 所有业务逻辑按功能拆分到独立模块，此处仅做聚合 re-export
 */
const { configure, mergeTagclawWalletEnv } = require('./config')
const { generateSteemKeys } = require('./steem')
const {
  resolveWriteSigner,
  signMessage,
  generateSteemKeysFromClaw,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv
} = require('./claw')
const {
  getBnbBalance,
  getErc20Balance,
  transferBnb,
  transferErc20
} = require('./balance')
const { getTokenPrice } = require('./price')
const { buyToken, sellToken } = require('./pump')
const {
  createCommunity,
  getNutboxCommunity,
  getNutboxPool,
  getNutboxFactories,
  getNutboxCommitteeFees,
  addNutboxErc20StakingPool,
  addNutboxErc20LockingPool,
  addNutboxErc1155Pool,
  setNutboxPoolRatios,
  claimNutboxRewards,
  depositNutboxErc20Pool,
  withdrawNutboxErc20Pool,
  redeemNutboxErc20Locking,
  depositNutboxErc1155Pool,
  withdrawNutboxErc1155Pool,
  harvestNutboxSocialPool,
  claimNutboxSocialPool
} = require('./nutbox')
const {
  getIpShareSupply,
  getIpShareBalance,
  getIpShareStakeInfo,
  getIpSharePendingRewards,
  createIpShare,
  buyIpShare,
  sellIpShare,
  stakeIpShare,
  unstakeIpShare,
  redeemIpShare,
  claimIpShareRewards,
  IPSHARE_CONTRACT
} = require('./ipshare')
const { DEFAULT_BNB_RPC } = require('./constants')
const { RegisterSteemMessage } = require('./constants')

module.exports = {
  configure,
  RegisterSteemMessage,
  generateSteemKeys,
  generateSteemKeysFromClaw,
  signMessage,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv,
  mergeTagclawWalletEnv,
  getBnbBalance,
  getErc20Balance,
  getTokenPrice,
  transferBnb,
  transferErc20,
  buyToken,
  sellToken,
  createCommunity,
  getNutboxCommunity,
  getNutboxPool,
  getNutboxFactories,
  getNutboxCommitteeFees,
  addNutboxErc20StakingPool,
  addNutboxErc20LockingPool,
  addNutboxErc1155Pool,
  setNutboxPoolRatios,
  claimNutboxRewards,
  depositNutboxErc20Pool,
  withdrawNutboxErc20Pool,
  redeemNutboxErc20Locking,
  depositNutboxErc1155Pool,
  withdrawNutboxErc1155Pool,
  harvestNutboxSocialPool,
  claimNutboxSocialPool,
  getIpShareSupply,
  getIpShareBalance,
  getIpShareStakeInfo,
  getIpSharePendingRewards,
  createIpShare,
  buyIpShare,
  sellIpShare,
  stakeIpShare,
  unstakeIpShare,
  redeemIpShare,
  claimIpShareRewards,
  IPSHARE_CONTRACT,
  DEFAULT_BNB_RPC
}
