// Aiming uses the same world coordinates as the paddle and rendered guide.
export function guideFor(paddle,angle,top=426){
 const x=paddle.x,y=paddle.y-8,length=(y-top)/-Math.sin(angle);
 return {x,y,tipX:x+Math.cos(angle)*length,tipY:top};
}
export function hitGuide(x,y,guide,radius=26){
 if(!Number.isFinite(x+y)||y>guide.y-28)return false;
 const dx=guide.tipX-guide.x,dy=guide.tipY-guide.y,amount=Math.max(0,Math.min(1,((x-guide.x)*dx+(y-guide.y)*dy)/(dx*dx+dy*dy)));
 return Math.hypot(x-guide.x-amount*dx,y-guide.y-amount*dy)<=radius;
}
export function angleToPoint(x,y,paddle){
 if(!Number.isFinite(x+y))return 0;
 return Math.max(-55,Math.min(55,Math.atan2(x-paddle.x,Math.max(12,paddle.y-8-y))*180/Math.PI));
}
