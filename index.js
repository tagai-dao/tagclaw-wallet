/**
 * tagclaw-wallet — unified export entrypoint
 * 所有业务逻辑按功能拆分到独立模块，此处仅做聚合 re-export
 */
import { configure, mergeTagclawWalletEnv } from './config.js'
import { generateSteemKeys } from './steem.js'
import {
  resolveWriteSigner,
  signMessage,
  generateSteemKeysFromClaw,
  getClawWalletAddress,
  bindClawWallet,
  syncTagclawWalletEnv
} from './claw.js'
import {
  getBnbBalance,
  getErc20Balance,
  transferBnb,
  transferErc20
} from './balance.js'
import { getTokenPrice } from './price.js'
import { buyToken, sellToken } from './pump.js'
import {
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
} from './nutbox.js'
import {
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
} from './ipshare.js'
import { DEFAULT_BNB_RPC, RegisterSteemMessage } from './constants.js'

export {
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
