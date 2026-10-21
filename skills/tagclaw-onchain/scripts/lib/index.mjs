import { ethers } from 'ethers'
import * as D from './deployment.mjs'
import { call } from './snapshot.mjs'
import { tokenState, address, uint, plan, coder, same, nativeBalance } from './prepare.mjs'
import { ERC20_BALANCE_ABI, TOKEN_ALLOWANCE_ABI } from './erc20-abi.mjs'
import { PCS_QUOTER_ABI, POOL_KEY_TYPE } from './v14-abi.mjs'
import { TOKEN_INDEX_ABI, BASKET_TOKEN_ABI, BASKET_REGISTRY_ABI, BASKET_HOOK_ABI, BASKET_SWAP_ABI, BASKET_TRADE_TYPE, BASKET_ROUTES_ABI, BASKET_EXECUTOR_ABI, COMMUNITY_INDEX_ABI } from './index-abi.mjs'
import { NUTBOX_POOL_ABI, ERC20_STAKING_POOL_ABI, NUTBOX_COMMUNITY_ABI } from './nutbox-abi.mjs'

async function indexState(snapshot, input) {
  const token=address(input.token,'token'),from=address(input.from,'from'),state=await tokenState(snapshot,token)
  const [basket,pendingReward]=await snapshot.read([call(token,TOKEN_INDEX_ABI,'indexToken'),call(token,TOKEN_INDEX_ABI,'pendingBuybackReward',[from])])
  if(same(basket,ethers.ZeroAddress)) return {token,from,version:state.version,basket:null,pendingReward,ready:false}
  const [version,registered,registry,engine,settlement,executor,count,supply,balance,fee,holderFees,creatorFees,launcherFees,frontendFees,creator,launcher]=await snapshot.read([
    call(basket,BASKET_TOKEN_ABI,'protocolVersion'),call(D.BASKET_REGISTRY,BASKET_REGISTRY_ABI,'basketVersion',[basket]),
    call(basket,BASKET_TOKEN_ABI,'registry'),call(basket,BASKET_TOKEN_ABI,'engine'),call(basket,BASKET_TOKEN_ABI,'settlementToken'),call(basket,BASKET_TOKEN_ABI,'rebalanceExecutor'),
    call(basket,BASKET_TOKEN_ABI,'assetCount'),call(basket,BASKET_TOKEN_ABI,'effectiveSupply'),call(basket,ERC20_BALANCE_ABI,'balanceOf',[from]),call(basket,BASKET_TOKEN_ABI,'basketFeeBps'),
    call(basket,BASKET_TOKEN_ABI,'claimableHolderFees',[from]),call(basket,BASKET_TOKEN_ABI,'pendingCreatorFees'),call(basket,BASKET_TOKEN_ABI,'pendingLauncherFees'),
    call(basket,BASKET_TOKEN_ABI,'pendingFrontendFees',[from]),call(basket,BASKET_TOKEN_ABI,'creatorPayout'),call(basket,BASKET_TOKEN_ABI,'launcherPayout')
  ])
  if(version!==4n||registered!==4n||!same(registry,D.BASKET_REGISTRY)||!same(engine,D.BASKET_HOOK)||!same(settlement,D.SETTLEMENT)||!same(executor,D.BASKET_EXECUTOR)||count<1n||count>10n)throw new Error('UNSUPPORTED_INDEX_DEPLOYMENT')
  const raw=await snapshot.read(Array.from({length:Number(count)},(_,i)=>call(basket,BASKET_TOKEN_ABI,'assetAt',[i])))
  const assets=raw.map(a=>({asset:a.asset,weight:Number(a.targetWeightBps),reserve:a.activeReserve}))
  if(assets.reduce((s,a)=>s+a.weight,0)!==10000||new Set(assets.map(a=>a.asset.toLowerCase())).size!==assets.length||assets.some(a=>same(a.asset,ethers.ZeroAddress)))throw new Error('INVALID_INDEX_ASSETS')
  return {token,from,version:state.version,basket,ready:true,pendingReward,supply,balance,feeBps:Number(fee),assets,holderFees,creatorFees,launcherFees,frontendFees,creator,launcher}
}

export async function indexInfo(snapshot,input){return {...snapshot.metadata(),...await indexState(snapshot,input)}}

async function allowancePlan(snapshot,info,asset,amount){
  const [balance,allowance]=await snapshot.read([call(asset,ERC20_BALANCE_ABI,'balanceOf',[info.from]),call(asset,TOKEN_ALLOWANCE_ABI,'allowance',[info.from,D.BASKET_ROUTER])])
  if(balance<amount)throw new Error('INSUFFICIENT_INDEX_TRADE_BALANCE')
  if(allowance>=amount)return null
  return plan(snapshot,info.from,allowance>0n?'reset-index-allowance':'approve-index-router',asset,TOKEN_ALLOWANCE_ABI,'approve',[D.BASKET_ROUTER,allowance>0n?0n:amount],0n,{basket:info.basket,rebuildAfterConfirmation:true})
}

export async function prepareIndex(snapshot,input){
  const info=await indexState(snapshot,input),{from,basket}=info
  if(!info.ready)throw new Error('INDEX_NOT_READY: index is created after listing; query token-info')
  const base={basket,token:info.token,rebuildAfterConfirmation:false}
  if(input.action==='claim-index'){
    if(info.pendingReward<=0n)throw new Error('NO_INDEX_REWARDS')
    return plan(snapshot,from,'claim-index',info.token,TOKEN_INDEX_ABI,'claimBuybackReward',[from],0n,base)
  }
  const claims={ 'claim-fees':['holderFees','claimHolderFeesFor',[from]],'claim-creator-fees':['creatorFees','claimCreatorFees',[]],
    'claim-launcher-fees':['launcherFees','claimLauncherFees',[]],'claim-frontend-fees':['frontendFees','claimFrontendFeesFor',[from]] }
  if(claims[input.action]){
    const [field,method,args]=claims[input.action]
    if(info[field]<=0n)throw new Error('NO_INDEX_FEES')
    if(input.action==='claim-creator-fees'&&!same(info.creator,from)||input.action==='claim-launcher-fees'&&!same(info.launcher,from))throw new Error('NOT_INDEX_FEE_RECIPIENT')
    return plan(snapshot,from,input.action,basket,BASKET_TOKEN_ABI,method,args,0n,base)
  }
  const amount=uint(input.amount,'amount')
  if(input.action==='redeem'){
    if(amount>info.balance||amount>info.supply||info.supply===0n)throw new Error('INSUFFICIENT_INDEX_BALANCE')
    const mask=input.legMask??info.assets.map(()=>true)
    if(!Array.isArray(mask)||mask.length!==info.assets.length||mask.some(m=>typeof m!=='boolean')||!mask.some(Boolean))throw new Error('INVALID_LEG_MASK')
    const selected=info.assets.map((a,i)=>({...a,i,gross:a.reserve*amount/info.supply})).filter((a,i)=>mask[i]&&a.gross>0n)
    if(!selected.length)throw new Error('ZERO_REDEMPTION')
    const routes=await snapshot.read(selected.map(a=>call(basket,BASKET_ROUTES_ABI,'assetRouteAt',[a.i])))
    const prices=await snapshot.read(selected.map((a,i)=>call(D.BASKET_EXECUTOR,BASKET_EXECUTOR_ABI,'quoteAssetToWbnb',[routes[i],a.asset,a.gross])))
    if(prices.some(p=>p<=0n))throw new Error('REDEMPTION_FEE_QUOTE_FAILED')
    const fee=(prices.reduce((a,b)=>a+b,0n)*BigInt(info.feeBps)+9999n)/10000n
    const cap=uint(input.nativeFeeCap,'nativeFeeCap',true),[bnb]=await snapshot.read([nativeBalance(from)])
    if(cap<fee||bnb<cap)throw new Error('REDEMPTION_FEE_CAP_TOO_LOW')
    return plan(snapshot,from,'index-redeem',basket,BASKET_TOKEN_ABI,'redeemInKind',[amount,mask,from],cap,{...base,estimatedNativeFee:fee,nativeFeeCap:cap})
  }
  if(!['buy','sell'].includes(input.action)||amount>=(1n<<128n))throw new Error('INVALID_INDEX_TRADE')
  const bps=input.slippageBps??100
  if(!Number.isInteger(bps)||bps<1||bps>500)throw new Error('INVALID_INDEX_SLIPPAGE: 1–500 bps')
  const [key,hook,settlement]=await snapshot.read([call(D.BASKET_HOOK,BASKET_HOOK_ABI,'selfPoolKey',[basket]),call(D.BASKET_ROUTER,BASKET_SWAP_ABI,'basketHook'),call(D.BASKET_ROUTER,BASKET_SWAP_ABI,'settlementToken')])
  if(!same(hook,D.BASKET_HOOK)||!same(settlement,D.SETTLEMENT)||!same(key.hooks,D.BASKET_HOOK)||!same(key.poolManager,D.MANAGER)||!([key.currency0,key.currency1].some(a=>same(a,basket))&&[key.currency0,key.currency1].some(a=>same(a,D.SETTLEMENT))))throw new Error('INDEX_POOL_MISMATCH')
  const buy=input.action==='buy'
  let limits=[]
  if(buy){
    if(info.supply===0n){
      if(!Array.isArray(input.legMins)||input.legMins.length!==info.assets.length)throw new Error('FIRST_INDEX_BUY_REQUIRES_LEG_MINS: provide current positive raw per-asset limits')
      limits=input.legMins.map(v=>uint(v,'legMin'))
    }else limits=info.assets.map(()=>1n)
  }
  const data=(minimum,legs)=>coder.encode([BASKET_TRADE_TYPE],[[ethers.ZeroAddress,buy?minimum:0n,buy?0n:minimum,legs,[],0n,[]]])
  const quote=async(minimum,legs)=>{
    const [[out]]=await snapshot.read([call(D.QUOTER,PCS_QUOTER_ABI,'quoteExactInputSingle',[[key,same(key.currency0,buy?D.SETTLEMENT:basket),amount,data(minimum,legs)]])])
    return out
  }
  const expected=await quote(1n,limits),minimum=expected*BigInt(10000-bps)/10000n
  if(minimum<=0n)throw new Error('ZERO_INDEX_OUTPUT')
  if(buy&&info.supply>0n) limits=info.assets.map(a=>{
    if(a.reserve<=0n)throw new Error('INVALID_INDEX_RESERVE')
    return (minimum*a.reserve+info.supply-1n)/info.supply
  })
  const protectedOut=await quote(minimum,limits)
  if(protectedOut<minimum)throw new Error('INDEX_PROTECTED_QUOTE_FAILED')
  const approval=await allowancePlan(snapshot,info,buy?D.SETTLEMENT:basket,amount)
  if(approval)return approval
  return plan(snapshot,from,`index-${input.action}`,D.BASKET_ROUTER,BASKET_SWAP_ABI,buy?'buyExactSettlement':'sellExactBasket',[basket,amount,minimum,data(minimum,limits),from],0n,
    {...base,settlementToken:D.SETTLEMENT,quote:{amountIn:amount,expectedOut:expected,minimumOut:minimum,slippageBps:bps,legMins:limits}})
}

export async function miningPools(snapshot,input){
  const token=address(input.token,'token'),from=address(input.from,'from')
  await tokenState(snapshot,token)
  const [community,count]=await snapshot.read([call(token,TOKEN_INDEX_ABI,'nutboxCommunity'),call(token,TOKEN_INDEX_ABI,'componentCount')])
  if(same(community,ethers.ZeroAddress)||count<1n||count>4n)throw new Error('COMPONENT_POOLS_UNAVAILABLE')
  const [ctoken]=await snapshot.read([call(community,COMMUNITY_INDEX_ABI,'getCommunityToken')])
  if(!same(ctoken,token))throw new Error('COMMUNITY_TOKEN_MISMATCH')
  const associations=await snapshot.read(Array.from({length:Number(count)},(_,i)=>[call(token,TOKEN_INDEX_ABI,'componentAt',[i]),call(community,COMMUNITY_INDEX_ABI,'createdPools',[i])]).flat())
  const pools=Array.from({length:Number(count)},(_,i)=>({position:i,asset:associations[i*2].asset,weight:Number(associations[i*2].weight),pair:associations[i*2].pair,pool:associations[i*2+1]}))
  if(new Set(pools.map(p=>p.pool.toLowerCase())).size!==pools.length||new Set(pools.map(p=>p.pair.toLowerCase())).size!==pools.length)throw new Error('DUPLICATE_MINING_POOL')
  const values=await snapshot.read(pools.flatMap(p=>[call(p.pool,ERC20_STAKING_POOL_ABI,'stakeToken'),call(p.pool,NUTBOX_POOL_ABI,'getCommunity'),
    call(p.pool,NUTBOX_POOL_ABI,'getUserStakedAmount',[from]),call(community,NUTBOX_COMMUNITY_ABI,'getPoolPendingRewards',[p.pool,from]),call(p.pair,ERC20_BALANCE_ABI,'balanceOf',[from])]))
  pools.forEach((p,i)=>{if(!same(values[i*5],p.pair)||!same(values[i*5+1],community))throw new Error('MINING_POOL_BINDING_MISMATCH');Object.assign(p,{staked:values[i*5+2],pendingRewards:values[i*5+3],walletLpBalance:values[i*5+4]})})
  return {...snapshot.metadata(),token,from,community,pools}
}
