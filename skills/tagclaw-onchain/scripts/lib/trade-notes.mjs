import {ethers} from 'ethers'
import {API_BASE} from './api.mjs'
import {walletPayload} from './wallet-payload.mjs'

export const NOTE_MAGIC='5461674149' // TagAI
const MARKER=NOTE_MAGIC.toLowerCase()+'01',CURATION_MAGIC='7461676169746331'
const hash=x=>{if(typeof x!=='string'||!/^0x[0-9a-f]{64}$/i.test(x))throw new Error('INVALID_NOTE_HASH');return x.toLowerCase()}
const address=x=>{if(!ethers.isAddress(x)||x.toLowerCase()===ethers.ZeroAddress)throw new Error('INVALID_NOTE_ADDRESS');return x.toLowerCase()}
export function normalizeNoteText(x){
 if(typeof x!=='string')throw new Error('INVALID_NOTE_TEXT')
 const text=x.normalize('NFC').replace(/\r\n?/g,'\n').trim()
 if(!text||[...text].length>1000||Buffer.byteLength(text)>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw new Error('INVALID_NOTE_TEXT')
 try{ethers.toUtf8Bytes(text)}catch{throw new Error('INVALID_NOTE_TEXT')}
 return text
}
const confValue=x=>{if(x==null)return null;if(!Number.isInteger(x)||x<0||x>100)throw new Error('INVALID_CONF');return x}
function normalized(n){
 if(!n||n.version!==1||n.chainId!==56||!['buy','sell'].includes(n.side)||!Number.isSafeInteger(n.expiresAt)||n.expiresAt<=0)throw new Error('INVALID_NOTE_CONTEXT')
 return {...n,wallet:address(n.wallet),token:address(n.token),text:normalizeNoteText(n.text),conf:confValue(n.conf??n.confidence),commitment:hash(n.commitment)}
}
function split(data){
 if(typeof data!=='string'||!/^0x(?:[0-9a-f]{2})*$/i.test(data))throw new Error('INVALID_NOTE_CALLDATA')
 let body=data.slice(2).toLowerCase(),curation=''
 if(body.slice(-80).startsWith(CURATION_MAGIC)){curation=body.slice(-80);body=body.slice(0,-80)}
 const footer=body.slice(-78)
 if(body.length<86||footer.slice(2,14)!==MARKER)throw new Error('NOTE_ONCHAIN_COMMITMENT_MISSING')
 const raw=parseInt(footer.slice(0,2),16)
 return {calldata:'0x'+body.slice(0,-78),commitment:'0x'+footer.slice(14),conf:raw===255?null:confValue(raw),curation}
}
// Public clients can check the signed chain commitment and conf. The private nonce stays at the API.
export async function verifyPublishedNote(provider,input){
 const n=normalized(input.verification??input),txHash=hash(input.txHash)
 if(Number((await provider.getNetwork()).chainId)!==56)throw new Error('WRONG_CHAIN')
 const tx=await provider.getTransaction(txHash),receipt=await provider.getTransactionReceipt(txHash)
 if(!tx||!receipt||Number(tx.chainId)!==56||Number(receipt.status)!==1||hash(tx.hash)!==txHash||address(tx.from)!==n.wallet)throw new Error('NOTE_TRANSACTION_MISMATCH')
 const block=await provider.getBlock(receipt.blockNumber)
 if(!block||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase()||input.blockHash&&input.blockHash.toLowerCase()!==receipt.blockHash.toLowerCase()||block.timestamp>n.expiresAt)throw new Error('NOTE_TRANSACTION_MISMATCH')
 const footer=split(tx.data??tx.input)
 if(footer.commitment!==n.commitment||footer.conf!==n.conf)throw new Error('NOTE_ONCHAIN_COMMITMENT_MISMATCH')
 return {chainCommitmentVerified:true,conf:n.conf,txHash,commitment:n.commitment,blockNumber:receipt.blockNumber,
  textVerification:'requires-private-server-nonce',independentTextVerification:false}
}
export class TradeNotesApi{
 constructor(fetcher=fetch){this.fetcher=fetcher}
 async request(path,body){
  const response=await this.fetcher(new URL(path,API_BASE),{method:body?'POST':'GET',headers:{'X-Chain-Id':'56',Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'})
  let data;try{data=await response.json()}catch{throw new Error('NOTE_API_INVALID_JSON')}
  if(!response.ok||data?.success!==true)throw new Error(`NOTE_API_FAILED: ${data?.error??response.status}`)
  return data
 }
 async follow(input){
  const token=address(input.token),params=new URLSearchParams({token})
  if(input.followTxHash)params.set('txHash',hash(input.followTxHash))
  else if(input.followAgentId)params.set('agentId',String(input.followAgentId));else return null
  const {source}=await this.request('/tagclaw/trades/follow-source?'+params)
  if(!source||address(source.token)!==token||address(source.wallet)!==address(source.ipshareSubject)||!/^tr_[0-9a-z]{50}_[0-9a-f]{8}$/.test(source.sourceId))throw new Error('FOLLOW_SOURCE_MISMATCH')
  hash(source.txHash)
  return source
 }
 async followIntent(input,source){
  const {source:result}=await this.request('/tagclaw/trades/follow-intent',{chainId:56,wallet:address(input.from??input.wallet),token:address(input.token),followTxHash:hash(source.txHash)})
  if(result?.sourceId!==source.sourceId||address(result.ipshareSubject)!==address(source.ipshareSubject))throw new Error('FOLLOW_SOURCE_MISMATCH')
  return result
 }
 async prepare(input,now=Math.floor(Date.now()/1000)){
  const wallet=address(input.wallet??input.from),token=address(input.token),side=input.side,text=normalizeNoteText(input.text),conf=confValue(input.conf??input.confidence)
  if(!['buy','sell'].includes(side))throw new Error('INVALID_SIDE')
  const issued=await this.request('/tagclaw/trades/nonce',{chainId:56,wallet,token,side,text,conf,...(input.followTxHash?{followTxHash:hash(input.followTxHash)}:{}),...(input.followAgentId?{followAgentId:input.followAgentId}:{})})
  const note=normalized(issued)
  if(note.wallet!==wallet||note.token!==token||note.side!==side||note.text!==text||note.conf!==conf||note.expiresAt<=now||note.expiresAt>now+3660||issued.nonce!==undefined)throw new Error('NOTE_NONCE_RESPONSE_MISMATCH')
  const expected='0x'+(conf??255).toString(16).padStart(2,'0')+MARKER+note.commitment.slice(2)
  if(issued.dataSuffix?.toLowerCase()!==expected)throw new Error('NOTE_SUFFIX_MISMATCH')
  if(note.follow){if(side!=='buy'||address(note.follow.ipshareSubject)!==address(note.follow.wallet))throw new Error('FOLLOW_SOURCE_MISMATCH')}
  return {...note,kind:'tagai-trade-note'}
 }
 async submit(input){
  const txHash=hash(input.txHash),result=await this.request('/tagclaw/trades/submit',{txHash})
  if(result.txHash!==txHash||!['queued','processing','accepted','rejected'].includes(result.status))throw new Error('NOTE_SUBMISSION_RESPONSE_MISMATCH')
  return {...result,retryBroadcast:false}
 }
 async status(input){
  const txHash=hash(input.txHash??input.hash),result=await this.request(`/tagclaw/trades/${txHash}`)
  if(result.txHash!==txHash||result.nonce!==undefined||result.verification?.nonce!==undefined)throw new Error('NOTE_STATUS_RESPONSE_MISMATCH')
  if(result.status==='accepted'){
   normalized(result)
   if(input.note&&result.commitment!==input.note.commitment)throw new Error('NOTE_STATUS_CONTEXT_MISMATCH')
  }
  return {...result,retryBroadcast:false}
 }
}
function assertReferral(data,action,subject){
 const iface=new ethers.Interface([
 'function buyToken(uint256,address,uint16)','function buyToken(uint256,address,uint16,address)',
 'function buyToken(uint256,address,uint16,bytes)','function buyToken(uint256,address,uint16,bytes,uint256)',
 'function buyToken(address,uint256,address[],address,uint256,address)',
 'function buyToken(address,uint8,bytes,uint256,address,uint256,address)',
 'function execute(bytes,bytes[],uint256)'])
 try{
  const decoded=iface.parseTransaction({data}),args=decoded.args
  let actual
  if(action.includes('-curve-'))actual=args[1]
  else if(action.includes('-import-'))actual=args[6]
  else if(action.includes('-v2-'))actual=args[0]
  else if(action.includes('-v4-')){
   const coder=ethers.AbiCoder.defaultAbiCoder(),[actions,inputs]=coder.decode(['bytes','bytes[]'],args[1][0])
   if(args[0]!=='0x10'||args[1].length!==1||actions!=='0x060c0f')throw new Error('route')
   const key='(address,address,address,address,uint24,bytes32)',[swap]=coder.decode([`(${key},bool,uint128,uint128,bytes)`],inputs[0])
   actual=coder.decode(['address'],swap[4])[0]
  }
  if(address(actual)!==address(subject))throw new Error('subject')
 }catch{throw new Error('FOLLOW_CALLDATA_IPSHARE_MISMATCH')}
}
export function attachNote(input,now=Math.floor(Date.now()/1000)){
 const {plan}=input,n=normalized(input.note)
 if(n.expiresAt<=now)throw new Error('NOTE_NONCE_EXPIRED')
 const expected='0x'+(n.conf??255).toString(16).padStart(2,'0')+MARKER+n.commitment.slice(2)
 if(n.dataSuffix?.toLowerCase()!==expected)throw new Error('NOTE_SUFFIX_MISMATCH')
 walletPayload(plan,now)
 const match=/^v\d+-(?:curve|v2|v4|import)-(buy|sell)$/.exec(plan.action??'')
 if(!match||plan.rebuildAfterConfirmation===true)throw new Error('NOTE_REQUIRES_FINAL_TOKEN_TRADE')
 if(match[1]!==n.side||address(plan.token)!==n.token||address(plan.transactions[0].from)!==n.wallet)throw new Error('NOTE_PLAN_CONTEXT_MISMATCH')
 if(plan.follow&&!n.follow)throw new Error('FOLLOW_NOTE_SOURCE_REQUIRED')
 if(n.follow&&(n.side!=='buy'||address(plan.ipshareSubject)!==address(n.follow.ipshareSubject)||plan.follow?.sourceId!==n.follow.sourceId))throw new Error('FOLLOW_PLAN_MISMATCH')
 if(n.follow)assertReferral(plan.transactions[0].data??plan.transactions[0].inputData,plan.action,n.follow.ipshareSubject)
 if(plan.tradeNote)throw new Error('NOTE_ALREADY_ATTACHED')
 const tx=plan.transactions[0]
 let data=String(tx.data??tx.inputData),curation=''
 if(data.slice(-80).toLowerCase().startsWith(CURATION_MAGIC)){curation=data.slice(-80);data=data.slice(0,-80)}
 if(data.slice(-76).toLowerCase().startsWith(MARKER))throw new Error('NOTE_ALREADY_ATTACHED')
 const intended=n.follow?.curation?.dataSuffix?.slice(2)??''
 if(intended&&!/^7461676169746331[0-9a-f]{64}$/i.test(intended))throw new Error('FOLLOW_ATTRIBUTION_MISMATCH')
 if(curation&&curation.toLowerCase()!==intended.toLowerCase()&&curation.toLowerCase()!==plan.follow?.curation?.dataSuffix?.slice(2).toLowerCase())throw new Error('FOLLOW_ATTRIBUTION_MISMATCH')
 data+=n.dataSuffix.slice(2)+(intended||curation)
 return {...plan,expiresAt:Math.min(plan.expiresAt,n.expiresAt),tradeNote:n,transactions:[{...tx,data,inputData:data}]}
}

export function attachFollow(plan,follow){
 const output={...plan,follow,ipshareSubject:follow.ipshareSubject}
 if(plan.rebuildAfterConfirmation===true)return output
 assertReferral(plan.transactions[0].data??plan.transactions[0].inputData,plan.action,follow.ipshareSubject)
 const suffix=follow.curation?.dataSuffix
 if(!suffix)return output
 if(!/^0x7461676169746331[0-9a-f]{64}$/i.test(suffix))throw new Error('FOLLOW_ATTRIBUTION_MISMATCH')
 const tx=plan.transactions[0],data=(tx.data??tx.inputData)+suffix.slice(2)
 return {...output,transactions:[{...tx,data,inputData:data}]}
}
