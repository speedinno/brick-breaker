import test from 'node:test';
import assert from 'node:assert/strict';
import {guideFor,hitGuide,angleToPoint} from '../dist/aim.js';
import {Game} from '../dist/engine.js';

test('dragging the visible guide changes direction while the paddle stays placed',()=>{
 const game=new Game(),paddleX=game.paddle.x,guide=guideFor(game.paddle,game.launchAngle);
 assert(hitGuide(guide.tipX,guide.tipY,guide));
 assert(hitGuide(guide.x,guide.y-60,guide));
 assert(!hitGuide(guide.x+80,guide.y-60,guide));
 assert(!hitGuide(guide.x,guide.y-4,guide),'Touch near the paddle must still place or move it');
 game.setLaunchAngle(angleToPoint(guide.tipX+30,guide.tipY,game.paddle));
 assert(game.launchAngle>-Math.PI/2);
 assert.equal(game.paddle.x,paddleX);
 assert.equal(angleToPoint(-1000,450,game.paddle),-55);
 assert.equal(angleToPoint(1000,450,game.paddle),55);
});
