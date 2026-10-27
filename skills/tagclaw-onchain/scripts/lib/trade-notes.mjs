import { ethers } from 'ethers'
import { walletPayload } from './wallet-payload.mjs'
import { API_BASE } from './api.mjs'

export const NOTE_MAGIC = '746167636c617731' // tagclaw1, 8 bytes
const CURATION_MAGIC = '7461676169746331'
const TYPES = ['string','uint256','address','address','bool','bytes32','uint64','string','uint16']
const coder=ethers.AbiCoder.defaultAbiCoder()
const address=value=>{
  if(!ethers.isAddress(value)||String(value).toLowerCase()===ethers.ZeroAddress)throw new Error('INVALID_NOTE_ADDRESS')
  return value.toLowerCase()
}
const hash=value=>{
  if(typeof value!=='string'||!/^0x[0-9a-f]{64}$/i.test(value))throw new Error('INVALID_NOTE_HASH')
  return value.toLowerCase()
}
export function normalizeNoteText(value) {
  if(typeof value!=='string')throw new Error('INVALID_NOTE_TEXT')
  const text=value.normalize('NFC').replace(/\r\n?/g,'\n').trim()
  if(!text||[...text].length>1000||Buffer.byteLength(text,'utf8')>4000||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text))throw new Error('INVALID_NOTE_TEXT')
  try {ethers.toUtf8Bytes(text)}catch{throw new Error('INVALID_NOTE_TEXT')}
  return text
}
function normalized(input) {
  if(!input||input.version!==1||input.chainId!==56||!['buy','sell'].includes(input.side))throw new Error('INVALID_NOTE_CONTEXT')
  const confidence=input.confidence??null
  if(confidence!==null&&(!Number.isInteger(confidence)||confidence<0||confidence>100))throw new Error('INVALID_CONFIDENCE')
  if(!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=0)throw new Error('INVALID_NOTE_EXPIRY')
  return {...input,wallet:address(input.wallet),token:address(input.token),nonce:hash(input.nonce),text:normalizeNoteText(input.text),confidence}
}
export function noteCommitment(input) {
  const n=normalized(input)
  return ethers.keccak256(coder.encode(TYPES,['TagClaw trade note v1',56,n.wallet,n.token,n.side==='buy',n.nonce,n.expiresAt,n.text,n.confidence??256]))
}
export function verifyNote(input) {
  const n=normalized(input.verification??input), calculated=noteCommitment(n)
  return {valid:calculated===hash(n.commitment),calculated,commitment:n.commitment,verification:n}
}
export async function verifyPublishedNote(provider,input) {
  const checked=verifyNote(input),n=checked.verification,txHash=hash(input.txHash)
  if(!checked.valid)throw new Error('NOTE_COMMITMENT_MISMATCH')
  if(Number((await provider.getNetwork()).chainId)!==56)throw new Error('WRONG_CHAIN')
  const tx=await provider.getTransaction(txHash),receipt=await provider.getTransactionReceipt(txHash)
  if(!tx||!receipt||Number(tx.chainId)!==56||Number(receipt.status)!==1||hash(tx.hash)!==txHash||address(tx.from)!==n.wallet
    ||input.blockHash&&input.blockHash.toLowerCase()!==receipt.blockHash.toLowerCase())throw new Error('NOTE_TRANSACTION_MISMATCH')
  const block=await provider.getBlock(receipt.blockNumber)
  if(!block||block.hash.toLowerCase()!==receipt.blockHash.toLowerCase()||block.timestamp>n.expiresAt)throw new Error('NOTE_TRANSACTION_MISMATCH')
  let data=String(tx.data??tx.input).slice(2).toLowerCase()
  if(data.slice(-80).startsWith(CURATION_MAGIC))data=data.slice(0,-80)
  if(data.slice(-80)!==NOTE_MAGIC+checked.calculated.slice(2))throw new Error('NOTE_ONCHAIN_COMMITMENT_MISMATCH')
  return {valid:true,chainVerified:true,txHash,commitment:checked.calculated,blockNumber:receipt.blockNumber}
}
export class TradeNotesApi {
  constructor(fetcher=fetch){this.fetcher=fetcher}
  async request(path,body) {
    const response=await this.fetcher(new URL(path,API_BASE),{
      method:body?'POST':'GET',headers:{'X-Chain-Id':'56',Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'
    })
    let data
    try {data=await response.json()}catch{throw new Error(`NOTE_API_INVALID_JSON: HTTP ${response.status}`)}
    if(!response.ok||data?.success!==true)throw new Error(`NOTE_API_FAILED: ${data?.error??response.status}`)
    return data
  }
  async prepare(input,now=Math.floor(Date.now()/1000)) {
    const wallet=address(input.wallet??input.from),token=address(input.token),side=input.side
    if(!['buy','sell'].includes(side))throw new Error('INVALID_SIDE')
    const text=normalizeNoteText(input.text),confidence=input.confidence??null
    if(confidence!==null&&(!Number.isInteger(confidence)||confidence<0||confidence>100))throw new Error('INVALID_CONFIDENCE')
    const issued=await this.request('/tagclaw/trades/nonce',{chainId:56,wallet,token,side})
    if(issued.version!==1||issued.chainId!==56||address(issued.wallet)!==wallet||address(issued.token)!==token||issued.side!==side
      ||issued.magic!==`0x${NOTE_MAGIC}`||!Number.isSafeInteger(issued.expiresAt)||issued.expiresAt<=now||issued.expiresAt>now+3660)throw new Error('NOTE_NONCE_RESPONSE_MISMATCH')
    const n=normalized({...issued,text,confidence})
    const commitment=noteCommitment(n)
    return {...n,kind:'tagclaw-trade-note',commitment,dataSuffix:`0x${NOTE_MAGIC}${commitment.slice(2)}`}
  }
  async submit(input) {
    const n=normalized(input.note)
    if(!verifyNote(n).valid)throw new Error('NOTE_COMMITMENT_MISMATCH')
    const txHash=hash(input.txHash)
    const result=await this.request('/tagclaw/trades/submit',{nonce:n.nonce,txHash,text:n.text,confidence:n.confidence})
    if(result.txHash!==txHash||!['queued','processing','accepted','rejected'].includes(result.status))throw new Error('NOTE_SUBMISSION_RESPONSE_MISMATCH')
    return {...result,retryBroadcast:false}
  }
  async status(input) {
    const txHash=hash(input.txHash??input.hash)
    const result=await this.request(`/tagclaw/trades/${txHash}`)
    if(result.txHash!==txHash)throw new Error('NOTE_STATUS_RESPONSE_MISMATCH')
    if(result.status==='accepted') {
      if(!verifyNote(result).valid)throw new Error('NOTE_COMMITMENT_MISMATCH')
      if(input.note&&result.verification.commitment!==noteCommitment(input.note))throw new Error('NOTE_STATUS_CONTEXT_MISMATCH')
    }
    return {...result,retryBroadcast:false}
  }
}
export function attachNote(input,now=Math.floor(Date.now()/1000)) {
  const {plan}=input,n=normalized(input.note)
  if(!verifyNote(n).valid||n.dataSuffix!==`0x${NOTE_MAGIC}${n.commitment.slice(2)}`)throw new Error('NOTE_COMMITMENT_MISMATCH')
  if(n.expiresAt<=now)throw new Error('NOTE_NONCE_EXPIRED')
  walletPayload(plan,now)
  const match=/^v\d+-(?:curve|v2|v4|import)-(buy|sell)$/.exec(plan.action??'')
  if(!match||plan.rebuildAfterConfirmation===true)throw new Error('NOTE_REQUIRES_FINAL_TOKEN_TRADE: finish approvals and rebuild first')
  if(match[1]!==n.side||address(plan.token)!==n.token)throw new Error('NOTE_PLAN_CONTEXT_MISMATCH')
  if(plan.tradeNote)throw new Error('NOTE_ALREADY_ATTACHED')
  const tx=plan.transactions[0]
  if(address(tx.from)!==n.wallet)throw new Error('NOTE_PLAN_WALLET_MISMATCH')
  let data=String(tx.data??tx.inputData),curation=''
  if(data.slice(-80).toLowerCase().startsWith(CURATION_MAGIC)){curation=data.slice(-80);data=data.slice(0,-80)}
  if(data.slice(-80).toLowerCase().startsWith(NOTE_MAGIC))throw new Error('NOTE_ALREADY_ATTACHED')
  data+=n.dataSuffix.slice(2)+curation
  return {...plan,expiresAt:Math.min(plan.expiresAt,n.expiresAt),tradeNote:n,
    transactions:[{...tx,data,inputData:data}]}
}
