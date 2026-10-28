import test from 'node:test'
import assert from 'node:assert/strict'
import {ethers} from 'ethers'
import {TradeNotesApi,attachNote,attachFollow,verifyPublishedNote,NOTE_MAGIC} from '../skills/tagclaw-onchain/scripts/lib/trade-notes.mjs'
import {walletPayload} from '../skills/tagclaw-onchain/scripts/lib/wallet-payload.mjs'
const wallet='0x'+'11'.repeat(20),token='0x'+'22'.repeat(20),txHash='0x'+'44'.repeat(32),commitment='0x'+'aa'.repeat(32)
function fixture(){
 const note={version:1,chainId:56,wallet,token,side:'buy',expiresAt:4600,text:'公开交易理由',conf:70,commitment,follow:null}
 note.dataSuffix='0x46'+NOTE_MAGIC+'01'+commitment.slice(2)
 const data=new ethers.Interface(['function buyToken(uint256,address,uint16) payable']).encodeFunctionData('buyToken',[0,ethers.ZeroAddress,1])
 return {note,plan:{schemaVersion:1,kind:'unsigned-transaction-plan',action:'v17-curve-buy',token,chainId:56,blockNumber:42,blockHash:ethers.ZeroHash,blockTimestamp:1000,expiresAt:1300,rebuildAfterConfirmation:false,transactions:[{chainId:56,from:wallet,to:token,value:'100',data,inputData:data,method:'buyToken'}]}}
}
test('draft uploads original text/conf and receives a commitment without the private nonce',async()=>{
 const requests=[],{note}=fixture()
 const api=new TradeNotesApi(async(url,options)=>{requests.push({url:String(url),options});return {ok:true,json:async()=>({success:true,...note})}})
 const result=await api.prepare({from:wallet,token,side:'buy',text:'公开交易理由',conf:70},1000)
 assert.equal(result.nonce,undefined);assert.equal(result.commitment,commitment)
 assert.deepEqual(JSON.parse(requests[0].options.body),{chainId:56,wallet,token,side:'buy',text:note.text,conf:70})
 assert.equal(requests[0].options.headers.Authorization,undefined)
})
test('conf is in cleartext before TagAI/01/hash and exact message is in wallet review',()=>{
 const {note,plan}=fixture(),out=attachNote({note,plan},1100)
 assert.equal(out.transactions[0].data,plan.transactions[0].data+note.dataSuffix.slice(2))
 assert.equal(walletPayload(out,1100).review.publicMessage.conf,70)
 assert.equal(walletPayload(out,1100).review.publicMessage.text,note.text)
 assert.equal(plan.tradeNote,undefined)
})
test('approvals, changed context, conf mismatch, duplicate notes and expired plans are rejected',()=>{
 const {note,plan}=fixture()
 for(const patch of [{action:'approve-permit2',rebuildAfterConfirmation:true},{token:wallet},{action:'v17-curve-sell'}])assert.throws(()=>attachNote({note,plan:{...plan,...patch}},1100))
 assert.throws(()=>attachNote({note:{...note,conf:69},plan},1100),/SUFFIX/)
 assert.throws(()=>attachNote({note,plan},1400),/PLAN_EXPIRED/)
 assert.throws(()=>attachNote({note,plan:attachNote({note,plan},1100)},1100),/ALREADY_ATTACHED/)
})
test('after success only transaction hash is reported and retries never broadcast',async()=>{
 const requests=[],api=new TradeNotesApi(async(_url,options)=>{requests.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,txHash,status:'queued'})}})
 assert.equal((await api.submit({txHash})).retryBroadcast,false);await api.submit({txHash})
 assert.deepEqual(requests,[{txHash},{txHash}])
})
test('public check verifies actual chain commitment/conf and explicitly does not claim independent text verification',async()=>{
 const {note,plan}=fixture(),out=attachNote({note,plan},1100)
 const provider={getNetwork:async()=>({chainId:56n}),getTransaction:async()=>({chainId:56,hash:txHash,from:wallet,data:out.transactions[0].data}),getTransactionReceipt:async()=>({status:1,blockNumber:42,blockHash:ethers.ZeroHash}),getBlock:async()=>({hash:ethers.ZeroHash,timestamp:1100})}
 const result=await verifyPublishedNote(provider,{txHash,...note})
 assert.equal(result.chainCommitmentVerified,true);assert.equal(result.independentTextVerification,false);assert.equal(result.conf,70)
 await assert.rejects(verifyPublishedNote(provider,{txHash,...note,conf:69}),/ONCHAIN_COMMITMENT_MISMATCH/)
 provider.getTransaction=async()=>({chainId:56,hash:txHash,from:wallet,data:plan.transactions[0].data})
 await assert.rejects(verifyPublishedNote(provider,{txHash,...note}),/COMMITMENT_MISSING/)
})
test('copy buys require the pinned IPShare subject and retain the exact final trade-curation suffix',()=>{
 const {note,plan}=fixture(),sourceId='tr_'+'0'.repeat(50)+'_00000002',subject='0x'+'77'.repeat(20),suffix='0x7461676169746331'+'bb'.repeat(32)
 note.follow={sourceId,ipshareSubject:subject,wallet:subject,curation:{dataSuffix:suffix}}
 plan.follow={sourceId};plan.ipshareSubject=subject
 const data=new ethers.Interface(['function buyToken(uint256,address,uint16)']).encodeFunctionData('buyToken',[0,subject,1]);plan.transactions[0].data=data;plan.transactions[0].inputData=data
 const out=attachNote({note,plan},1100)
 assert.ok(out.transactions[0].data.endsWith(note.dataSuffix.slice(2)+suffix.slice(2)))
 assert.throws(()=>attachNote({note,plan:{...plan,ipshareSubject:wallet}},1100),/FOLLOW_PLAN_MISMATCH/)
 const bad=new ethers.Interface(['function buyToken(uint256,address,uint16)']).encodeFunctionData('buyToken',[0,wallet,1])
 assert.throws(()=>attachNote({note,plan:{...plan,transactions:[{...plan.transactions[0],data:bad,inputData:bad}]}},1100),/CALLDATA_IPSHARE_MISMATCH/)
})
test('agent selection resolves only a verified source for the same token',async()=>{
 const source={sourceId:'tr_'+'0'.repeat(50)+'_00000002',token,txHash,wallet,ipshareSubject:wallet,agentId:'caller.ai'}
 const api=new TradeNotesApi(async()=>({ok:true,json:async()=>({success:true,source})}))
 assert.equal((await api.follow({token,followAgentId:'caller.ai'})).ipshareSubject,wallet)
 source.ipshareSubject=token
 await assert.rejects(api.follow({token,followTxHash:txHash}),/FOLLOW_SOURCE_MISMATCH/)
})

test('plain copy buy carries tradecuration and message attachment replaces only the same pinned source intent',()=>{
 const {note,plan}=fixture(),subject='0x'+'77'.repeat(20),sourceId='tr_'+'0'.repeat(50)+'_00000002'
 const a='0x7461676169746331'+'bb'.repeat(32),b='0x7461676169746331'+'cc'.repeat(32)
 const data=new ethers.Interface(['function buyToken(uint256,address,uint16)']).encodeFunctionData('buyToken',[0,subject,1])
 plan.transactions[0].data=data;plan.transactions[0].inputData=data
 const follow={sourceId,ipshareSubject:subject,wallet:subject,curation:{dataSuffix:a}}
 const copy=attachFollow(plan,follow);assert.ok(copy.transactions[0].data.endsWith(a.slice(2)))
 note.follow={...follow,curation:{dataSuffix:b}}
 const out=attachNote({note,plan:copy},1100)
 assert.ok(out.transactions[0].data.endsWith(note.dataSuffix.slice(2)+b.slice(2)))
 assert.equal(out.transactions[0].data.includes(a.slice(2)),false)
 assert.throws(()=>attachNote({note:{...note,follow:null},plan:copy},1100),/SOURCE_REQUIRED/)
})

test('AgentSwapWrapper copy buy retains calldata subject, cleartext conf and final TC suffix',()=>{
 const {note,plan}=fixture(),subject='0x'+'77'.repeat(20),suffix='0x7461676169746331'+'bb'.repeat(32)
 const follow={sourceId:'tr_'+'0'.repeat(50)+'_00000002',ipshareSubject:subject,wallet:subject,curation:{dataSuffix:suffix}}
 plan.action='v18-agent-buy';plan.transactions[0].to='0x3F7146D3D234Ed4C2021DE1A5B14da8754e6C577'
 const iface=new ethers.Interface(['function buyToken(address,uint8,bytes,uint256,address,uint256,address) payable'])
 const data=iface.encodeFunctionData('buyToken',[token,3,'0xab',1,wallet,1300,subject]);plan.transactions[0].data=data;plan.transactions[0].inputData=data
 note.follow=follow
 const out=attachNote({plan:attachFollow(plan,follow),note},1100)
 assert.ok(out.transactions[0].data.endsWith(note.dataSuffix.slice(2)+suffix.slice(2)))
 assert.equal(iface.parseTransaction({data:out.transactions[0].data}).args[6],subject)
})
