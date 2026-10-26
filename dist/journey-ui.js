import {createDefinition,hydrateDefinition} from './catalog.js';
import {isCompleted,isUnlocked,nextRequired,lockReason,completedCount} from './progress.js';
import {difficultyProfile} from './difficulty.js';
import {masteryLabel} from './mastery.js';
const $=id=>document.getElementById(id);
export class JourneyMap {
  constructor({getProgress,select,open,close}){
    this.getProgress=getProgress;this.select=select;this.open=open;this.close=close;this.page=13;
    $('playNext').onclick=()=>this.play(nextRequired(this.getProgress()));
    $('playRequired').onclick=()=>{this.close('lockDialog');this.play(nextRequired(this.getProgress()));};
    $('previousStages').onclick=()=>{this.page=Math.max(13,this.page-12);this.renderJourney();};
    $('moreStages').onclick=()=>{if(Number.isSafeInteger(this.page+23)){this.page+=12;this.renderJourney();}};
  }
  play(level){this.close('gallery');void this.select(level);}
  show(){const p=this.getProgress();this.page=p.journeyNext>=13?13+Math.floor((p.journeyNext-13)/12)*12:13;this.render();this.open('gallery');}
  render(){
    const p=this.getProgress();$('starterSummary').textContent=`${p.starters.length} of 12 starters completed`;$('starterMeter').value=p.starters.length;
    const chapter=difficultyProfile(p.journeyNext);
    $('journeySummary').textContent=p.starters.length<12?`Complete the starter set to open the journey. Next: stage ${nextRequired(p)}.`:`${completedCount(p).toLocaleString()} stages completed. Stage ${p.journeyNext.toLocaleString()} is ready. Chapter ${chapter.chapter} · ${chapter.chapterName} · ${chapter.label}. ${8-chapter.chapterClears} clears to the next chapter.`;
    $('playNext').textContent=`Play next · Stage ${nextRequired(p)}`;
    const grid=$('patternGrid');grid.replaceChildren();
    for(let level=1;level<=12;level++){
      const d=createDefinition(level),pattern=hydrateDefinition(d),button=document.createElement('button'),mini=document.createElement('canvas'),label=document.createElement('span'),status=document.createElement('small');
      mini.width=416;mini.height=434;const ctx=mini.getContext('2d');ctx.fillStyle='#191919';ctx.fillRect(0,0,416,434);
      for(const c of pattern.cells){ctx.fillStyle=c.type==='wall'?'#9a9a91':c.type==='gate'?'#e8d530':c.color||pattern.color;const inset=c.type==='wall'?0:.55;ctx.fillRect(c.x+inset,c.y+inset,c.w-inset*2,c.h-inset*2);}
      label.textContent=`${String(level).padStart(2,'0')} ${d.name}`;const complete=isCompleted(p,level),mastery=masteryLabel(p,level);status.textContent=mastery||(complete?'✓ Completed':'Ready to play');status.classList.toggle('mastery-status',Boolean(mastery));button.classList.toggle('completed',complete);button.classList.toggle('active',p.selected===level);button.append(mini,label,status);button.setAttribute('aria-label',`Stage ${level}, ${d.name}, ${mastery|| (complete?'completed, replay':'ready to play')}`);button.onclick=()=>this.play(level);grid.append(button);
    }
    this.renderJourney();
  }
  renderJourney(){
    const p=this.getProgress();$('journeyPageLabel').textContent=`Stages ${this.page.toLocaleString()}–${(this.page+11).toLocaleString()}`;$('previousStages').disabled=this.page===13;
    $('journeyHint').textContent=p.starters.length===12?'Each clear opens one new stage. The pattern is revealed when you enter.':'The journey opens when all 12 starter stages have a completion tick.';
    const grid=$('journeyGrid');grid.replaceChildren();
    for(let level=this.page;level<this.page+12;level++){
      const unlocked=isUnlocked(p,level),complete=isCompleted(p,level),button=document.createElement('button'),symbol=document.createElement('b'),label=document.createElement('span'),status=document.createElement('small');
      const mastery=masteryLabel(p,level);symbol.textContent=mastery?mastery[0]:complete?'✓':unlocked?'▶':'🔒';symbol.setAttribute('aria-hidden','true');label.textContent=`Stage ${level.toLocaleString()}`;status.textContent=mastery||(complete?'Completed':unlocked?'Ready to discover':'Locked');status.classList.toggle('mastery-status',Boolean(mastery));button.className=complete?'completed':unlocked?'ready':'locked';button.setAttribute('aria-label',`Stage ${level}, ${status.textContent}${unlocked?', play':', show unlock requirement'}`);button.append(symbol,label,status);
      button.onclick=()=>{if(unlocked)this.play(level);else{$('lockTitle').textContent=`Stage ${level} is locked`;$('lockMessage').textContent=lockReason(this.getProgress(),level);$('playRequired').textContent=`Play stage ${nextRequired(this.getProgress())}`;this.open('lockDialog');}};
      grid.append(button);
    }
  }
}
