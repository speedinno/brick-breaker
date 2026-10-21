// Versioned, deterministic graph synthesis. None of these layouts are transforms
// of the twelve reference motifs. Keep this module identical on server/client.
export const GENERATOR_VERSION = 3;
export const ARCHITECTURES = ['Circuit', 'Orbit', 'Honeycomb', 'Constellation', 'Atrium', 'Vortex', 'Delta', 'Coral'];
const SIZE = 52, CELL = 8, OY = 18;
const PALETTES = [
  ['#ed2856','#f14a38','#df306d'], ['#9fbf27','#d6b72d','#68a742'],
  ['#cd39ba','#7f55db','#e74688'], ['#25bdb0','#4297ce','#4fb45a'],
  ['#ed843c','#d94d54','#dda92a'], ['#65b53c','#b8bd24','#3c9a74'],
  ['#e44073','#d35dbb','#b744db'], ['#e8b62c','#df8541','#d64d62'],
];
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function seededRandom(text) {
  let a=1779033703,b=3144134277,c=1013904242,d=2773480762;
  for(const ch of String(text)) {const k=ch.charCodeAt(0);a=b^Math.imul(a^k,597399067);b=c^Math.imul(b^k,2869860233);c=d^Math.imul(c^k,951274213);d=a^Math.imul(d^k,2716044179);}
  return () => {a|=0;b|=0;c|=0;d|=0;const t=((a+b|0)+d|0)>>>0;d=d+1|0;a=b^b>>>9;b=c+(c<<3)|0;c=(c<<21|c>>>11)+t|0;return t/4294967296;};
}
function distance(x,y,a,b) {const dx=b[0]-a[0],dy=b[1]-a[1];const t=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
function makeSites(kind, random, level) {
  const sites=[], ri=(a,b)=>a+Math.floor(random()*(b-a+1));
  if(kind===1||kind===5) {
    const rings=ri(2,3),phase=random()*6.28;
    sites.push([26+random()*4-2,25]);
    for(let ring=1;ring<=rings;ring++) {const count=ri(5,9)+ring,r=ring*(20/rings);for(let j=0;j<count;j++){const angle=phase+j*Math.PI*2/count+(kind===5?ring*.43:0),radius=r+(random()-.5)*2;sites.push([26+Math.cos(angle)*radius,25+Math.sin(angle)*radius]);}}
  } else if(kind===3||kind===7) {
    const count=ri(15,26);let tries=0;
    while(sites.length<count&&tries++<1000){const p=[5+random()*42,4+random()*42];if(sites.every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>5.2))sites.push(p);}
  } else if(kind===4) {
    let boxes=[[4,4,44,43]];const count=ri(11,19);
    while(boxes.length<count){boxes.sort((a,b)=>b[2]*b[3]-a[2]*a[3]);const [x,y,w,h]=boxes.shift(),t=.38+random()*.24;if(w>h){boxes.push([x,y,w*t,h],[x+w*t,y,w*(1-t),h]);}else{boxes.push([x,y,w,h*t],[x,y+h*t,w,h*(1-t)]);}}
    for(const [x,y,w,h] of boxes) sites.push([x+w/2,y+h/2]);
  } else {
    const cols=ri(3,5),rows=ri(3,5),dx=40/(cols-1),dy=39/(rows-1);
    for(let row=0;row<rows;row++)for(let col=0;col<cols;col++) {
      const stagger=kind===2&&(row%2)?dx*.35:0;
      sites.push([clamp(6+col*dx+stagger+(random()-.5)*2,4,48),clamp(5+row*dy+(random()-.5)*2,3,47)]);
    }
    if(kind===6)sites.sort((a,b)=>b[1]-a[1]);
  }
  return sites.map(p=>p.map(v=>Math.round(v*2)/2));
}
function makeGraph(sites,random,kind) {
  const used=new Set([0]),edges=[],degree=new Uint8Array(sites.length),candidates=[];
  for(let a=0;a<sites.length;a++)for(let b=a+1;b<sites.length;b++) {
    const length=Math.hypot(sites[a][0]-sites[b][0],sites[a][1]-sites[b][1]);
    candidates.push({a,b,length,weight:length*(.55+random()*.95)});
  }
  candidates.sort((a,b)=>a.weight-b.weight);
  while(used.size<sites.length){const edge=candidates.find(e=>used.has(e.a)!==used.has(e.b));if(!edge)throw Error('Disconnected graph');edges.push(edge);degree[edge.a]++;degree[edge.b]++;used.add(edge.a);used.add(edge.b);}
  const extras=2+Math.floor(random()*5);
  for(const edge of candidates)if(edges.length<sites.length-1+extras&&edge.length<15&&!edges.includes(edge)&&random()<.25){edges.push(edge);degree[edge.a]++;degree[edge.b]++;}
  const paths=[];
  for(const edge of edges){const a=sites[edge.a],b=sites[edge.b];
    if(kind===0||kind===4)paths.push([a,random()<.5?[a[0],b[1]]:[b[0],a[1]],b]);
    else if(kind===7){const mid=[(a[0]+b[0])/2+(random()-.5)*5,(a[1]+b[1])/2+(random()-.5)*5];paths.push([a,mid,b]);}
    else paths.push([a,b]);
  }
  return {paths,degree,edges};
}
const neighbours=id=>{const c=id%SIZE;return [id-SIZE,id+SIZE,c?id-1:-1,c<SIZE-1?id+1:-1].filter(n=>n>=0&&n<SIZE*SIZE);};
export function reachable(layout,entry) {
  const seen=new Uint8Array(SIZE*SIZE),queue=[51*SIZE+clamp(Math.floor(entry),1,50)];seen[queue[0]]=1;
  for(let i=0;i<queue.length;i++)for(const id of neighbours(queue[i]))if(!seen[id]&&layout[id]!=='w'){seen[id]=1;queue.push(id);}
  return seen;
}
function connectRegions(layout,entry) {
  for(let attempt=0;attempt<64;attempt++) {
    const seen=reachable(layout,entry);
    if(layout.every((type,id)=>type!=='b'&&type!=='g'||seen[id]))return true;
    const dist=new Int32Array(SIZE*SIZE).fill(1e6),parent=new Int32Array(SIZE*SIZE).fill(-1),deque=new Map();let head=0,tail=0,found=-1;
    for(let id=0;id<seen.length;id++)if(seen[id]){dist[id]=0;deque.set(tail++,id);}
    while(head<tail){const id=deque.get(head);deque.delete(head++);if(!seen[id]&&layout[id]!=='w'){found=id;break;}
      for(const next of neighbours(id)){const row=Math.floor(next/SIZE),col=next%SIZE;if(!row||row===51||!col||col===51)continue;const cost=layout[next]==='w'?1:0;if(dist[next]>dist[id]+cost){dist[next]=dist[id]+cost;parent[next]=id;if(cost)deque.set(tail++,next);else deque.set(--head,next);}}
    }
    if(found<0)return false;
    for(let id=found;id>=0&&!seen[id];id=parent[id])if(layout[id]==='w')layout[id]='g';
  }
  return false;
}
export function canonicalLayout(signature) {
  if(typeof signature!=='string'||signature.length!==SIZE*SIZE)throw Error('Invalid layout');
  let best=signature;
  for(let flip=0;flip<2;flip++)for(let rotation=0;rotation<4;rotation++){
    const out=new Array(SIZE*SIZE);
    for(let row=0;row<SIZE;row++)for(let col=0;col<SIZE;col++){let x=flip?51-col:col,y=row;for(let i=0;i<rotation;i++)[x,y]=[51-y,x];out[y*SIZE+x]=signature[row*SIZE+col];}
    const next=out.join('');if(next<best)best=next;
  }
  return best;
}
export function patternFromLayout(definition) {
  const {layout,entry,name,color,palette,tones}=definition;
  if(typeof layout!=='string'||layout.length!==2704||!/^[bwg.]+$/.test(layout)||!Number.isFinite(entry)||entry<2||entry>50)throw Error('Invalid stage definition');
  const cells=[],bricks=[];
  for(let id=0;id<layout.length;id++)if(layout[id]!=='.'){
    const r=Math.floor(id/52),c=id%52,type={b:'brick',w:'wall',g:'gate'}[layout[id]];
    const cell={id,r,c,x:c*8,y:18+r*8,w:8,h:8,type,hp:type==='wall'?Infinity:1};
    if(type==='brick'&&palette?.length)cell.color=palette[Number(tones?.[id]||0)%palette.length];
    cells.push(cell);if(type!=='wall')bricks.push(cell);
  }
  return {cells,bricks,signature:layout,family:definition.family??12,name,color:color||'#ed2856',entry:{x:entry*8,y:18+52*8},generatorVersion:definition.version||3,recipe:definition.recipe||{},metrics:definition.metrics||{},paths:[]};
}
export function validateDefinition(definition) {
  const p=patternFromLayout(definition),layout=p.signature,seen=reachable(layout,definition.entry);
  if(p.bricks.length<450||p.bricks.length>2500)throw Error('Stage density outside bounds');
  if(p.cells.filter(c=>c.type==='wall').length<100)throw Error('Insufficient channel walls');
  if(!p.bricks.every(c=>seen[c.id]))throw Error('Unreachable colored region');
  if([...layout.slice(0,52)].some(t=>t!=='w'))throw Error('Open top boundary');
  for(let r=0;r<52;r++)if(layout[r*52]!=='w'||layout[r*52+51]!=='w')throw Error('Open side boundary');
  const bottom=layout.slice(-52);if(!bottom.includes('..')||bottom.replaceAll('w','').length>5)throw Error('Invalid entrance');
  return p;
}
export function generateDefinition(level,nonce=0) {
  if(!Number.isSafeInteger(level)||level<13||!Number.isSafeInteger(nonce)||nonce<0||nonce>1024)throw Error('Invalid generated stage');
  const kind=(level-13)%ARCHITECTURES.length;
  for(let attempt=0;attempt<24;attempt++){
    const random=seededRandom(`brick-breaker:${GENERATOR_VERSION}:${level}:${nonce}:${attempt}`),sites=makeSites(kind,random,level),graph=makeGraph(sites,random,kind),entry=9+Math.floor(random()*34);
    const bottom=sites.reduce((a,b)=>Math.hypot(b[0]-entry,b[1]-51)<Math.hypot(a[0]-entry,a[1]-51)?b:a),paths=[[[entry,52],[entry,48],bottom],...graph.paths],segments=paths.flatMap(points=>points.slice(1).map((b,i)=>[points[i],b]));
    const chambers=sites.filter((_,i)=>graph.degree[i]>1&&random()<.19).map(p=>({p,r:1.4+random()*1.5})),layout=[],tones=[],palette=PALETTES[Math.floor(random()*PALETTES.length)],hueAxis=random()<.5;
    for(let r=0;r<52;r++)for(let c=0;c<52;c++){
      const x=c+.5,y=r+.5;let d=Infinity;
      for(const [a,b]of segments)d=Math.min(d,distance(x,y,a,b));
      for(const chamber of chambers)d=Math.min(d,Math.hypot(x-chamber.p[0],y-chamber.p[1])-chamber.r+1.1);
      let type=d<1.12?'.':d<2.12?'w':'b';
      if(!r||r===51||!c||c===51)type='w';
      if(r>=48&&Math.abs(x-entry)<1.12)type='.';
      layout.push(type);tones.push(String(Math.floor((hueAxis?x:y)/18)%palette.length));
    }
    // Put visible breakable outlets at leaves and chambers, including one near
    // the entrance. A single distant exit makes a fresh stage needlessly slow.
    for(let node=0;node<sites.length;node++)if(graph.degree[node]===1||sites[node]===bottom||random()<.22){
      const [x,y]=sites[node],candidates=[];
      for(let r=Math.max(1,Math.floor(y)-4);r<=Math.min(50,Math.ceil(y)+4);r++)for(let c=Math.max(1,Math.floor(x)-4);c<=Math.min(50,Math.ceil(x)+4);c++){
        const id=r*52+c,near=neighbours(id);if(layout[id]==='w'&&near.some(n=>layout[n]==='.')&&near.some(n=>layout[n]==='b'))candidates.push({id,weight:Math.hypot(c+.5-x,r+.5-y)+random()*.8});
      }
      candidates.sort((a,b)=>a.weight-b.weight);if(candidates.length)layout[candidates[0].id]='g';
    }
    // Colored regions get breakable vents; permanent walls never trap a target.
    if(!connectRegions(layout,entry))continue;
    const definition={version:3,level,layout:layout.join(''),entry,name:`${ARCHITECTURES[kind]} ${level}`,color:palette[0],palette,tones:tones.join(''),family:12+kind,recipe:{kind,nonce,attempt,nodes:sites.length,edges:graph.edges.length},metrics:{branches:[...graph.degree].filter(n=>n>2).length,loops:graph.edges.length-sites.length+1}};
    try {validateDefinition(definition);return definition;}catch{}
  }
  throw Error(`No valid connected layout for stage ${level}`);
}
