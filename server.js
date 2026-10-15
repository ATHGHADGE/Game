const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const rooms = new Map();
const streams = new Map();
const powers = [
  { id: 'double', name: 'Double Down', description: 'Double your hand score this round.' },
  { id: 'mulligan', name: 'Mulligan', description: 'Draw 3 extra cards before choosing your hand.' },
  { id: 'wild', name: 'Wild Suit', description: 'Choose a suit; all 5 played cards count as that suit.' },
  { id: 'ace', name: 'Ace Up', description: 'Your highest card counts as an Ace for this hand.' },
  { id: 'sabotage', name: 'Cut the Deck', description: 'Secretly remove one random unplayed card from a rival.' },
  { id: 'spy', name: 'Spyglass', description: 'Privately peek at three random cards in a rival’s hand.' },
  { id: 'royal', name: 'Royal Decree', description: 'Turn one of your cards into a Queen, King, or Ace.' }
];
const suits = ['♠', '♥', '♦', '♣'];
const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function roomCode() { let c; do { c = Math.random().toString(36).slice(2, 6).toUpperCase(); } while (rooms.has(c)); return c; }
function shuffledDeck() { const d = suits.flatMap(s => ranks.map((r, i) => ({ id: crypto.randomUUID(), rank: r, value: i + 2, suit: s }))); for (let i=d.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [d[i],d[j]]=[d[j],d[i]]; } return d; }
function publicRoom(room, viewer) {
  return { code: room.code, matchId: room.matchId, host: room.host, phase: room.phase, mode:room.mode, totalRounds:room.totalRounds, handSeconds:room.handSeconds, deadline:room.deadline, round: room.round, target: Math.max(100, 150 - (room.round - 1) * 10), winner: room.winner, winnerId: room.winnerId, winnerIds:room.winnerIds||[],
    players: room.players.map(p => ({ id:p.id, name:p.name, host:p.id===room.host, alive:p.alive, spectator:!p.alive, submitted:!!p.submitted, handCount:p.hand?.length||0, score:p.score, cumulativeScore:p.cumulativeScore||0, handName:p.handName, power:p.power, powerOptions:p.id===viewer?p.powerOptions:undefined, selectedPower:p.id===viewer?p.selectedPower:undefined, powerUsed:p.powerUsed, spyReveal:p.id===viewer?p.spyReveal:undefined, notice:p.id===viewer?p.notice:undefined, hand:p.id===viewer && p.alive ? p.hand : undefined, extra:p.id===viewer ? p.extra : undefined, chosen:p.id===viewer ? p.chosen : undefined, wildSuit:p.id===viewer ? p.wildSuit : undefined })),
    lastResults: room.lastResults };
}
function broadcast(code) { const room=rooms.get(code); if (!room) return; for(const [id,res] of streams.get(code)||[]) { res.write(`event: state\ndata: ${JSON.stringify(publicRoom(room,id))}\n\n`); } }
function handScore(cards, power, wildSuit) {
  let vals=cards.map(c=>c.value); if(power==='ace') vals[vals.indexOf(Math.max(...vals))]=14; const sorted=[...vals].sort((a,b)=>a-b);
  const counts=new Map(); vals.forEach(v=>counts.set(v,(counts.get(v)||0)+1)); const groups=[...counts.values()].sort((a,b)=>b-a);
  const flush=power==='wild' ? true : cards.every(c=>c.suit===cards[0].suit);
  const straight=sorted.every((v,i)=>i===0||v===sorted[i-1]+1)||(sorted.join(',')==='2,3,4,5,14');
  let tier=0,name='High card';
  if(straight&&flush){tier=8;name='Straight flush';} else if(groups[0]===4){tier=7;name='Four of a kind';} else if(groups[0]===3&&groups[1]===2){tier=6;name='Full house';} else if(flush){tier=5;name='Flush';} else if(straight){tier=4;name='Straight';} else if(groups[0]===3){tier=3;name='Three of a kind';} else if(groups[0]===2&&groups[1]===2){tier=2;name='Two pair';} else if(groups[0]===2){tier=1;name='Pair';}
  const base=tier*80 + vals.reduce((a,b)=>a+b,0);
  const score=power==='double'?base*2:base;
  return {score,name,groups:scoringGroups(cards,name,power)};
}
function scoringGroups(cards,name,power) {
  const values=new Map(cards.map(c=>[c.id,c.value]));
  if(power==='ace') { const highest=Math.max(...cards.map(c=>c.value)); const card=cards.find(c=>c.value===highest); if(card)values.set(card.id,14); }
  const sorted=[...cards].sort((a,b)=>values.get(a.id)-values.get(b.id));
  if((name==='Straight'||name==='Straight flush')&&sorted.map(c=>values.get(c.id)).join(',')==='2,3,4,5,14'){values.set(sorted.at(-1).id,1);sorted.sort((a,b)=>values.get(a.id)-values.get(b.id));}
  const byRank=new Map(); for(const c of cards){const value=values.get(c.id);if(!byRank.has(value))byRank.set(value,[]);byRank.get(value).push(c);}
  const buckets=[...byRank.entries()].sort((a,b)=>b[1].length-a[1].length||b[0]-a[0]);
  const singles=list=>list.flatMap(([,cs])=>cs.map(c=>[c.id]));
  const pairBuckets=buckets.filter(([,cs])=>cs.length===2);
  if(name==='Straight'||name==='Straight flush')return sorted.map(c=>[c.id]);
  if(name==='Flush'||name==='High card')return [...cards].sort((a,b)=>values.get(b.id)-values.get(a.id)).map(c=>[c.id]);
  if(name==='Full house')return [buckets[0][1].map(c=>c.id),buckets[1][1].map(c=>c.id)];
  if(name==='Four of a kind')return [buckets[0][1].map(c=>c.id),...singles(buckets.slice(1))];
  if(name==='Three of a kind')return [buckets[0][1].map(c=>c.id),...singles(buckets.slice(1).sort((a,b)=>b[0]-a[0]))];
  if(name==='Two pair')return [...pairBuckets.map(([,cs])=>cs.map(c=>c.id)),...singles(buckets.filter(([,cs])=>cs.length===1))];
  if(name==='Pair')return [pairBuckets[0][1].map(c=>c.id),...singles(buckets.filter(([,cs])=>cs.length===1).sort((a,b)=>b[0]-a[0]))];
  return singles(buckets);
}
function nextRound(room) {
  room.round++; room.phase='playing'; room.lastResults=[]; room.winner=null; room.winnerId=null; room.winnerIds=[];
  const target=Math.max(100,150-(room.round-1)*10);
  for(const p of room.players.filter(x=>x.alive)) {
    const deck=shuffledDeck(), options=[...powers].sort(()=>Math.random()-.5).slice(0,3); p.hand=deck.slice(0,8); p.extra=deck.slice(8,11); p.chosen=[]; p.wildSuit=null; p.powerOptions=options; p.power=null; p.selectedPower=null; p.spyReveal=null; p.notice=null; p.powerUsed=false; p.submitted=false; p.score=null; p.handName=null;
  }
  room.target=target;
  if(room.timer)clearTimeout(room.timer);
  if(room.handSeconds>0){room.deadline=Date.now()+room.handSeconds*1000;room.timer=setTimeout(()=>{const current=rooms.get(room.code);if(current!==room||room.phase!=='playing')return;for(const player of room.players.filter(x=>x.alive&&!x.submitted)){const hand=[...player.hand].sort(()=>Math.random()-.5);player.chosen=hand.slice(0,5).map(c=>c.id);player.submitted=true;player.notice=`Time is up. A random five-card hand was locked for you.`;player.noticeId=crypto.randomUUID();}if(room.players.filter(x=>x.alive).every(x=>x.submitted))resolve(room);broadcast(room.code);},room.handSeconds*1000);}
  else room.deadline=null;
}
function resolve(room) {
  if(room.timer)clearTimeout(room.timer);room.timer=null;room.deadline=null;
  const active=room.players.filter(p=>p.alive);
  for(const p of active) { const result=handScore(p.chosen.map(id=>p.hand.find(c=>c.id===id)),p.powerUsed?p.power.id:null,p.wildSuit); p.score=result.score+(result.score>=room.target?15:0); p.cumulativeScore=(p.cumulativeScore||0)+p.score; p.handName=result.name; p.scoreGroups=result.groups; }
  let out=null;
  if(room.mode!=='rounds') { const low=Math.min(...active.map(p=>p.score)); const losers=active.filter(p=>p.score===low); out=losers[Math.floor(Math.random()*losers.length)]; out.alive=false; }
  room.lastResults=room.players.map(p=>({id:p.id,name:p.name,score:p.score||0,cumulativeScore:p.cumulativeScore||0,handName:p.handName||'—',eliminated:!p.alive,played:active.includes(p),cards:active.includes(p)?p.chosen.map(id=>p.hand.find(c=>c.id===id)).filter(Boolean):[],groups:p.scoreGroups||[]})).sort((a,b)=>b.cumulativeScore-a.cumulativeScore||b.score-a.score);
  const survivors=room.players.filter(p=>p.alive);
  if(room.mode==='rounds'&&room.round>=room.totalRounds){const high=Math.max(...survivors.map(p=>p.cumulativeScore||0));room.winnerIds=survivors.filter(p=>p.cumulativeScore===high).map(p=>p.id);room.winner=survivors.filter(p=>p.cumulativeScore===high).map(p=>p.name).join(' & ');room.winnerId=room.winnerIds[0]||null;room.phase='gameover';}
  else {room.phase=survivors.length===1?'gameover':'results';if(survivors.length===1){room.winner=survivors[0].name;room.winnerId=survivors[0].id;room.winnerIds=[survivors[0].id];}}
}
async function readBody(req) { let s=''; for await(const c of req) s+=c; try{return JSON.parse(s||'{}');}catch{return{};} }
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`); const parts=url.pathname.split('/').filter(Boolean);
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});return res.end();}
  if(parts[0]==='api') {
    if(parts[1]==='create'&&req.method==='POST') {const b=await readBody(req);const code=roomCode();const id=crypto.randomUUID();const room={code,matchId:crypto.randomUUID(),host:id,players:[{id,name:String(b.name||'Player 1').slice(0,18),alive:true,hand:[],extra:[],chosen:[],power:null,powerOptions:[],selectedPower:null,powerUsed:false,submitted:false,cumulativeScore:0}],phase:'lobby',mode:'elimination',totalRounds:5,handSeconds:60,deadline:null,round:0,winner:null,winnerId:null,winnerIds:[],lastResults:[]};rooms.set(code,room);streams.set(code,new Map());return json(res,200,{code,id});}
    if(parts[1]==='join'&&req.method==='POST') {const b=await readBody(req);const room=rooms.get(String(b.code||'').toUpperCase());if(!room)return json(res,404,{error:'Room not found. Check the code and try again.'});if(room.phase!=='lobby')return json(res,409,{error:'This game has already started.'});if(room.players.length>=8)return json(res,409,{error:'This room is full (8 players).'});const id=crypto.randomUUID();room.players.push({id,name:String(b.name||'Player').slice(0,18),alive:true,hand:[],extra:[],chosen:[],power:null,powerOptions:[],selectedPower:null,powerUsed:false,submitted:false,cumulativeScore:0});broadcast(room.code);return json(res,200,{code:room.code,id});}
    if(parts[1]==='state'&&req.method==='GET') {const code=String(url.searchParams.get('room')||'').toUpperCase(),id=url.searchParams.get('id'),room=rooms.get(code);if(!room)return json(res,404,{error:'Room not found.'});if(!room.players.some(x=>x.id===id))return json(res,403,{error:'Player session not found.'});return json(res,200,publicRoom(room,id));}
    if(parts[1]==='events'&&req.method==='GET') {const code=String(url.searchParams.get('room')||'').toUpperCase(),id=url.searchParams.get('id'),room=rooms.get(code);if(!room)return json(res,404,{error:'Room not found.'});const p=room.players.find(x=>x.id===id);if(!p)return json(res,403,{error:'Player session not found.'});res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','Access-Control-Allow-Origin':'*'});res.write(`event: state\ndata: ${JSON.stringify(publicRoom(room,id))}\n\n`);streams.get(code).set(id,res);req.on('close',()=>streams.get(code)?.delete(id));return;}
    if(parts[1]==='action'&&req.method==='POST') {const b=await readBody(req),room=rooms.get(String(b.code||'').toUpperCase());if(!room)return json(res,404,{error:'Room not found.'});const p=room.players.find(x=>x.id===b.id);if(!p)return json(res,403,{error:'Player session not found.'});
      if(b.action==='start'){if(p.id!==room.host)return json(res,403,{error:'Only the host can start.'});if(room.phase!=='lobby'||room.players.length<2)return json(res,409,{error:'At least two players are needed.'});room.mode=b.mode==='rounds'?'rounds':'elimination';room.totalRounds=[3,5,7,10].includes(Number(b.totalRounds))?Number(b.totalRounds):5;room.handSeconds=[0,30,45,60,90].includes(Number(b.handSeconds))?Number(b.handSeconds):60;for(const player of room.players){player.cumulativeScore=0;player.alive=true;}nextRound(room);}
      else if(b.action==='choosePower'){if(room.phase!=='playing'||!p.alive||p.submitted||p.powerUsed)return json(res,409,{error:'You cannot choose a power-up now.'});const choice=p.powerOptions?.find(power=>power.id===b.powerId);if(!choice)return json(res,400,{error:'Choose one of the three powers dealt to you.'});p.power=choice;p.selectedPower=choice.id;}
      else if(b.action==='power'){if(room.phase!=='playing'||!p.alive||p.submitted)return json(res,409,{error:'You cannot use a power-up now.'});if(!p.power||p.powerUsed)return json(res,409,{error:'Choose one power-up first.'});const target=['sabotage','spy'].includes(p.power.id)?room.players.find(x=>x.id===b.targetId&&x.alive&&x.id!==p.id&&!x.submitted):null;if(['sabotage','spy'].includes(p.power.id)&&!target)return json(res,400,{error:'Choose a rival who has not locked in yet.'});if(p.power.id==='wild'&&!['♠','♥','♦','♣'].includes(b.suit))return json(res,400,{error:'Choose a suit for Wild Suit.'});if(p.power.id==='royal'){const card=p.hand.find(x=>x.id===b.cardId),values={Q:12,K:13,A:14};if(!card||!values[b.rank])return json(res,400,{error:'Choose a card and a Queen, King, or Ace rank.'});card.rank=b.rank;card.value=values[b.rank];}if(p.power.id==='sabotage'){if(target.hand.length<=5)return json(res,409,{error:'That rival has too few cards left to sabotage safely.'});target.hand.splice(Math.floor(Math.random()*target.hand.length),1);target.notice='A rival secretly removed one of your cards.';target.noticeId=crypto.randomUUID();}if(p.power.id==='spy')p.spyReveal=[...target.hand].sort(()=>Math.random()-.5).slice(0,3);if(p.power.id==='mulligan'){p.hand=p.hand.concat(p.extra);p.extra=[];}if(p.power.id==='wild')p.wildSuit=b.suit;if(p.power.id==='ace')p.hand.sort((a,b)=>b.value-a.value);p.powerUsed=true;}
      else if(b.action==='play'){if(room.phase!=='playing'||!p.alive||p.submitted)return json(res,409,{error:'You cannot play now.'});const ids=Array.isArray(b.cards)?b.cards:[];if(ids.length!==5||new Set(ids).size!==5||ids.some(id=>!p.hand.some(c=>c.id===id)))return json(res,400,{error:'Select exactly 5 cards from your hand.'});p.chosen=ids;p.submitted=true;if(room.players.filter(x=>x.alive).every(x=>x.submitted))resolve(room);}
      else if(b.action==='next'){if(p.id!==room.host)return json(res,403,{error:'Only the host can continue.'});if(room.phase!=='results')return json(res,409,{error:'The round is not over.'});if([0,30,45,60,90].includes(Number(b.handSeconds)))room.handSeconds=Number(b.handSeconds);nextRound(room);}
      else if(b.action==='rematch'){if(p.id!==room.host)return json(res,403,{error:'Only the host can start a rematch.'});if(room.phase!=='gameover')return json(res,409,{error:'The game is not over yet.'});if(room.timer)clearTimeout(room.timer);room.deadline=null;room.phase='lobby';room.round=0;room.matchId=crypto.randomUUID();room.winner=null;room.winnerId=null;room.winnerIds=[];room.lastResults=[];for(const player of room.players){player.alive=true;player.hand=[];player.extra=[];player.chosen=[];player.power=null;player.powerOptions=[];player.selectedPower=null;player.spyReveal=null;player.notice=null;player.powerUsed=false;player.submitted=false;player.score=null;player.cumulativeScore=0;player.handName=null;player.wildSuit=null;}}
      else if(b.action==='exit'){const leaving=room.players.findIndex(player=>player.id===p.id);if(room.phase==='playing'&&p.alive){p.alive=false;const survivors=room.players.filter(player=>player.alive);if(survivors.length===1){room.phase='gameover';room.winner=survivors[0].name;room.winnerId=survivors[0].id;}else if(survivors.length>1&&survivors.every(player=>player.submitted))resolve(room);}room.players.splice(leaving,1);streams.get(room.code)?.get(p.id)?.end();streams.get(room.code)?.delete(p.id);if(room.host===p.id&&room.players.length)room.host=room.players[0].id;if(!room.players.length){rooms.delete(room.code);for(const stream of streams.get(room.code)?.values()||[])stream.end();streams.delete(room.code);return json(res,200,{ok:true});}broadcast(room.code);return json(res,200,{ok:true});}
      else return json(res,400,{error:'Unknown action.'});broadcast(room.code);return json(res,200,{ok:true});
    }
    return json(res,404,{error:'Unknown API route.'});
  }
  let file=parts.length?path.join(publicDir,...parts):path.join(publicDir,'index.html');if(!file.startsWith(publicDir))return json(res,403,{error:'Forbidden'});try{const data=fs.readFileSync(file);const ext=path.extname(file);res.writeHead(200,{'Content-Type':ext==='.js'?'text/javascript':ext==='.css'?'text/css':'text/html','Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Last Hand listening on http://localhost:${PORT}`));
