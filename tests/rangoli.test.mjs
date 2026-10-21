import test from 'node:test';import assert from 'node:assert/strict';
import {createDefinition,hydrateDefinition} from '../dist/catalog.js';
import {Game} from '../dist/engine.js';
test('rangoli families and occasional narrow entrances at both extremes are present',()=>{
 const kinds=new Set(),entries={left:[],right:[],middle:[]};
 for(let level=13;level<=212;level++){const d=createDefinition(level);kinds.add(d.recipe.kind);entries[d.entrance].push(d);assert.equal(d.layout.slice(-52).replaceAll('w','').length,2);}
 for(const kind of [16,17,18,19])assert(kinds.has(kind));assert(entries.left.length>=20&&entries.right.length>=20&&entries.middle.length>=70);
 for(const side of ['left','right'])for(const d of entries[side].slice(0,8)){
  const g=new Game({level:d.level,seed:8937,mode:'watch',patternFactory:()=>hydrateDefinition(d)});g.launch();let entered=false;
  for(let n=0;n<120*6&&g.status==='playing';n++){g.step(1/120);if(g.balls.some(b=>b.y<430))entered=true;}
  assert(entered,`${side} entrance at stage ${d.level} must admit a served ball`);
 }
});
