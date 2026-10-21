const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const CHAPTERS=['First Light','Hidden Gardens','Crystal Skies','Living Labyrinths','Celestial Currents','Infinite Horizons'];
export function difficultyProfile(level){
  const journey=Math.max(0,level-13),growth=1-Math.exp(-journey/110),chapter=Math.floor(journey/8);
  return {growth,chapter:chapter+1,chapterName:CHAPTERS[Math.min(CHAPTERS.length-1,Math.floor(chapter/3))],chapterClears:journey%8,
    label:growth<.18?'Easy':growth<.4?'Building':growth<.65?'Challenging':growth<.84?'Advanced':'Expert',
    speed:level<=12?Math.min(430,320+level*2):350+72*growth,
    paddleWidth:level<=12?82:82-16*growth,
    siteTarget:Math.round(8+20*growth),loopTarget:Math.round(1+6*growth),
    channelRadius:1.18-.12*growth,gateGenerosity:.4-.2*growth,
    boostInterval:level<=12?47:47+Math.floor(16*growth)};
}
