import test from 'node:test'
import assert from 'node:assert/strict'
import {ethers} from 'ethers'
import {TradeNotesApi,noteCommitment,attachNote,verifyNote,verifyPublishedNote,NOTE_MAGIC} from '../skills/tagclaw-onchain/scripts/lib/trade-notes.mjs'
import {walletPayload} from '../skills/tagclaw-onchain/scripts/lib/wallet-payload.mjs'
const wallet=`0x${'11'.repeat(20)}`,token=`0x${'22'.repeat(20)}`,nonce=`0x${'33'.repeat(32)}`,txHash=`0x${'44'.repeat(32)}`
function fixture(){
 const note={version:1,chainId:56,wallet,token,side:'buy',nonce,expiresAt:4600,text:'买入的理由\n公开可验证',confidence:70}
 note.commitment=noteCommitment(note);note.dataSuffix=`0x${NOTE_MAGIC}${note.commitment.slice(2)}`
 const data=new ethers.Interface(['function buyToken(uint256,address,uint16) payable']).encodeFunctionData('buyToken',[0,ethers.ZeroAddress,1])
 return {note,plan:{schemaVersion:1,kind:'unsigned-transaction-plan',action:'v17-curve-buy',token,chainId:56,blockNumber:42,blockHash:ethers.ZeroHash,blockTimestamp:1000,expiresAt:1300,rebuildAfterConfirmation:false,
 transactions:[{chainId:56,from:wallet,to:token,value:'100',data,inputData:data,method:'buyToken'}]}}
}
test('nonce is issued without credentials and no chain transaction is sent',async()=>{
 const requests=[]
 const api=new TradeNotesApi(async(url,options)=>{requests.push({url:String(url),options});return {ok:true,json:async()=>({success:true,version:1,chainId:56,wallet,token,side:'buy',nonce,expiresAt:4600,magic:`0x${NOTE_MAGIC}`})}})
 const note=await api.prepare({from:wallet,token,side:'buy',text:'买入的理由\r\n公开可验证',confidence:70},1000)
 assert.equal(note.commitment,'0x70eab8002d4de6cc4b69569a3e834317dace4e055e1f450ff1aaff5e4508eb02')
 assert.equal(note.commitment,fixture().note.commitment)
 assert.equal(requests[0].url,'https://bsc-api.tagai.fun/tagclaw/trades/nonce')
 assert.deepEqual(JSON.parse(requests[0].options.body),{chainId:56,wallet,token,side:'buy'})
 assert.equal(requests[0].options.headers.Authorization,undefined)
})
test('full ABI data is preserved, note precedes existing curation footer, and review shows the public message',()=>{
 const {note,plan}=fixture(),curation='7461676169746331'+'aa'.repeat(32)
 plan.transactions[0].data+=curation;plan.transactions[0].inputData+=curation
 const output=attachNote({note,plan},1100),data=output.transactions[0].data
 assert.equal(data,plan.transactions[0].data.slice(0,-80)+note.dataSuffix.slice(2)+curation)
 assert.equal(output.transactions[0].inputData,data)
 assert.equal(walletPayload(output,1100).review.publicMessage.text,note.text)
 assert.equal(plan.tradeNote,undefined)
})
test('cannot attach to approvals, a different wallet/token/side, an expired quote or an already annotated plan',()=>{
 const {note,plan}=fixture()
 for(const patch of [{action:'approve-permit2',rebuildAfterConfirmation:true},{token:wallet},{action:'v17-curve-sell'}])assert.throws(()=>attachNote({note,plan:{...plan,...patch}},1100))
 assert.throws(()=>attachNote({note,plan:{...plan,transactions:[{...plan.transactions[0],from:token}]}},1100),/WALLET_MISMATCH/)
 assert.throws(()=>attachNote({note,plan},1400),/PLAN_EXPIRED/)
 const annotated=attachNote({note,plan},1100)
 assert.throws(()=>attachNote({note,plan:annotated},1100),/ALREADY_ATTACHED/)
})
test('message/nonce/context changes invalidate the commitment',()=>{
 const {note}=fixture()
 for(const patch of [{text:'changed'},{confidence:71},{nonce:txHash},{wallet:token},{side:'sell'}])assert.equal(verifyNote({...note,...patch}).valid,false)
 assert.throws(()=>verifyNote({...note,confidence:'70'}),/INVALID_CONFIDENCE/)
 assert.throws(()=>verifyNote({...note,text:'x\ud800y'}),/INVALID_NOTE_TEXT/)
})
test('report retries preserve hash and public preimage and never request a new broadcast',async()=>{
 const {note}=fixture(),requests=[]
 const api=new TradeNotesApi(async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,txHash,status:'queued'})}})
 assert.equal((await api.submit({note,txHash})).retryBroadcast,false)
 await api.submit({note,txHash})
 assert.deepEqual(requests[0],requests[1]);assert.deepEqual(requests[0],{nonce,txHash,text:note.text,confidence:70})
})
test('public verification independently compares the preimage to actual canonical transaction calldata',async()=>{
 const {note,plan}=fixture(),annotated=attachNote({note,plan},1100)
 const provider={getNetwork:async()=>({chainId:56n}),getTransaction:async()=>({hash:txHash,chainId:56n,from:wallet,data:annotated.transactions[0].data}),getTransactionReceipt:async()=>({status:1,blockNumber:42,blockHash:ethers.ZeroHash}),getBlock:async()=>({hash:ethers.ZeroHash,timestamp:1100})}
 const result=await verifyPublishedNote(provider,{txHash,verification:note})
 assert.equal(result.chainVerified,true)
 provider.getTransaction=async()=>({hash:txHash,chainId:56n,from:wallet,data:plan.transactions[0].data})
 await assert.rejects(verifyPublishedNote(provider,{txHash,verification:note}),/ONCHAIN_COMMITMENT_MISMATCH/)
})
test('a forged accepted API response cannot pass even if its replacement preimage is self-consistent',async()=>{
 const {note,plan}=fixture(),real=attachNote({note,plan},1100)
 const forged={...note,text:'platform changed the reason'};forged.commitment=noteCommitment(forged)
 const provider={getNetwork:async()=>({chainId:56n}),getTransaction:async()=>({hash:txHash,chainId:56n,from:wallet,data:real.transactions[0].data}),getTransactionReceipt:async()=>({status:1,blockNumber:42,blockHash:ethers.ZeroHash}),getBlock:async()=>({hash:ethers.ZeroHash,timestamp:1100})}
 assert.equal(verifyNote(forged).valid,true)
 await assert.rejects(verifyPublishedNote(provider,{txHash,verification:forged}),/ONCHAIN_COMMITMENT_MISMATCH/)
})
