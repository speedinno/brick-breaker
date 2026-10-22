import test from 'node:test';
import assert from 'node:assert/strict';
import {fitViewport,worldX} from '../dist/viewport.js';

test('phone, tablet and landscape cameras show the entire world without stretching',()=>{
  for(const [w,h] of [[320,388],[360,620],[393,555],[412,711],[430,728],[768,880],[654,393]]){
    const v=fitViewport(w,h,3);
    assert(v.x>=0&&v.y>=0);
    assert(v.x+416*v.scale<=w+.001);
    assert(v.y+660*v.scale<=h+.001);
    assert.equal(v.pixelsWide,w*3);
    for(const x of [0,40,208,375,416])assert(Math.abs(worldX(17+v.x+x*v.scale,17,v)-x)<1e-9);
    assert.equal(worldX(-100,0,v),0);assert.equal(worldX(10000,0,v),416);
  }
});
test('resize preserves logical paddle targets and caps the rendering memory on dense devices',()=>{
  for(const ratio of [1,1.25,2,3,5]){
    const a=fitViewport(393,648,ratio),b=fitViewport(320,388,ratio);
    assert(a.ratio<=3&&b.ratio<=3);
    const target=worldX(a.x+200*a.scale,0,a);
    assert(Math.abs(worldX(b.x+target*b.scale,0,b)-200)<1e-9);
  }
});
