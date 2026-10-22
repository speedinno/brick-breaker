import test from 'node:test';
import assert from 'node:assert/strict';
import {fitViewport,worldX,dialogViewport} from '../dist/viewport.js';

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

test('keyboard dialogs stay inside a visual viewport that has panned upward',()=>{
  const visible={height:500,offsetTop:120,scale:1};
  const box=dialogViewport(874,visible);
  assert.deepEqual(box,{top:120,height:500,bottom:254});
  // With safe areas and spacing, neither close control nor panel bottom is occluded.
  assert(box.top+62>=visible.offsetTop);
  assert(box.top+box.height-34<=visible.offsetTop+visible.height);
  assert.deepEqual(dialogViewport(500,{height:500,offsetTop:0,scale:1}),{top:0,height:500,bottom:0});
});
test('dialog follows the real keyboard dismissal, including the interval after input blur',()=>{
  // Losing input focus must not jump to the full layout while the keyboard remains.
  assert.deepEqual(dialogViewport(874,{height:500,offsetTop:120,scale:1}),{top:120,height:500,bottom:254});
  assert.deepEqual(dialogViewport(874,{height:650,offsetTop:60,scale:1}),{top:60,height:650,bottom:164});
  assert.deepEqual(dialogViewport(874,{height:874,offsetTop:0,scale:1}),{top:0,height:874,bottom:0});
  assert.equal(dialogViewport(874,{height:400,offsetTop:100,scale:2}),null);
  assert.equal(dialogViewport(874,null),null);
});
