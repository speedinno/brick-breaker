const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CHAPTERS=['First Light','Hidden Gardens','Crystal Skies','Living Labyrinths','Celestial Currents','Infinite Horizons'];
export const starterVolleySeconds=level=>[12,10,8,6,4,3,2,1][level-1]??0;
export function difficultyProfile(level){
  const journey=Math.max(0,level-13),growth=1-Math.exp(-journey/110),chapter=Math.floor(journey/8);
  return {growth,chapter:chapter+1,chapterName:CHAPTERS[Math.min(CHAPTERS.length-1,Math.floor(chapter/3))],chapterClears:journey%8,
    label:growth<.18?'Easy':growth<.4?'Building':growth<.65?'Challenging':growth<.84?'Advanced':'Expert',
    speed:level<=8?228+level*12:level<=12?310+level*3:350+72*growth,
    paddleWidth:level<=4?168:level<=8?[156,144,132,120][level-5]:level<=12?[112,104,96,88][level-9]:82-16*growth,
    siteTarget:Math.round(8+20*growth),loopTarget:Math.round(1+6*growth),
    channelRadius:1.18-.12*growth,gateGenerosity:.4-.2*growth,
    boostInterval:level<=4?[20,24,28,30][level-1]:level<=8?38:level<=12?47:47+Math.floor(16*growth)};
}
// A forgiving round at each chapter boundary gives players a chance to recover.
// Published generated layouts keep their original version and geometry.
export function playProfile(level){
 const profile=difficultyProfile(level);
 if(level!==8&&(level<20||(level-20)%8!==0))return profile;
 return {...profile,label:'Breather',breather:true,speed:Math.max(280,profile.speed-35),paddleWidth:Math.min(level===8?144:112,profile.paddleWidth+18),boostInterval:Math.max(28,profile.boostInterval-16)};
}
