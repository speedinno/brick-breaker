import config from './cloud-config.js';
import {completedCount,isCompleted} from './progress.js';
const $=id=>document.getElementById(id);
export class AccountPanel {
  constructor({cloud,getProgress,getGuest,open,callbacks,native=false}){
    Object.assign(this,{cloud,getProgress,getGuest,open,callbacks,native});this.pending=false;this.before=null;
    $('signInForm').onsubmit=e=>{e.preventDefault();void this.run(async()=>{this.email=$('accountEmail').value.trim();await cloud.sendCode(this.email);$('codePanel').hidden=false;$('codeEmail').textContent=this.email;this.message('Check your email for your sign-in code.');$('accountCode').focus();});};
    $('verifyForm').onsubmit=e=>{e.preventDefault();void this.run(async()=>{await cloud.verifyCode(this.email||$('accountEmail').value.trim(),$('accountCode').value.trim());$('accountCode').value='';this.message('Signed in. Your cloud progress is ready.');});};
    $('usePassword').onclick=()=>{$('passwordPanel').hidden=!$('passwordPanel').hidden;};
    $('passwordForm').onsubmit=e=>{e.preventDefault();void this.run(async()=>{const email=$('passwordEmail').value.trim();const password=$('accountPassword').value;$('accountPassword').value='';await cloud.passwordLogin(email,password);this.message('Signed in.');});};
    $('signOut').onclick=()=>void this.run(async()=>{await cloud.signOut();this.message('Signed out. Guest progress is separate.');});
    $('syncNow').onclick=()=>void this.run(async()=>{await callbacks.sync();this.message('Cloud progress updated.');});
    $('importGuest').onclick=()=>void this.run(async()=>{await callbacks.importGuest();this.message('Device progress linked to this account.');this.render();});
    $('showHistory').onclick=()=>void this.run(()=>this.history(true));
    $('moreHistory').onclick=()=>void this.run(()=>this.history(false));
    $('exportHistory').onclick=()=>void this.run(async()=>{
      if(native){window.open('https://speedinno.github.io/brick-breaker/?account=export','_blank','noopener');this.message('Open Account on the web game to export your history.');return;}
      const owner=cloud.userId;let cursor=null,history=[],account,progress;
      do{const page=await cloud.exportData(cursor);if(cloud.userId!==owner)throw Error('Your account changed. Start the export again.');account=page.account;progress=page.progress;history.push(...page.history);cursor=page.nextBefore;if(history.length>100000)throw Error('This export is very large. Contact support for a full data export.');}while(cursor);
      const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),account,progress,history},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='brick-breaker-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);this.message('Your history export is ready.');
    });
    $('requestDelete').onclick=()=>{$('deleteConfirm').value='';$('deleteError').textContent='';open('deleteDialog');};
    $('deleteForm').onsubmit=e=>{e.preventDefault();if($('deleteConfirm').value!=='DELETE'){$('deleteError').textContent='Type DELETE to confirm.';return;}void this.run(async()=>{await callbacks.deleteAccount();$('deleteDialog').close();this.message('Your account and cloud history were deleted.');}).catch(()=>{});};
    if(config.supportEmail){$('supportLink').href='mailto:'+config.supportEmail;$('supportLink').textContent=config.supportEmail;}
  }
  message(text,error=false){$('accountMessage').textContent=text;$('accountMessage').classList.toggle('error',error);}
  async run(action){if(this.pending)return;this.pending=true;$('accountBusy').hidden=false;try{await action();}catch(e){this.message(e.message||'Please try again.',true);if($('deleteDialog').open)$('deleteError').textContent=e.message||'Please try again.';}finally{this.pending=false;$('accountBusy').hidden=true;this.render();}}
  show(){this.render();this.open('account');}
  render(){
    const signed=this.cloud.signedIn,p=this.getProgress(),guest=this.getGuest();
    if(this.historyOwner!==this.cloud.userId){this.historyOwner=this.cloud.userId;this.before=null;$('historyPanel').hidden=true;$('historyList').replaceChildren();$('moreHistory').hidden=true;}
    $('cloudUnavailable').hidden=this.cloud.configured;$('signInPanel').hidden=signed||!this.cloud.configured;$('signedInPanel').hidden=!signed;
    $('accountDescription').textContent=signed?`Signed in as ${this.cloud.email}`:'Play without an account. Your device keeps your progress.';
    $('accountProgress').textContent=`${completedCount(p).toLocaleString()} stages completed · ${p.pending.length?`${p.pending.length} saves waiting to upload`:signed?'Cloud account connected':'Saved on this device'}`;
    $('importGuest').hidden=!signed||!(guest.starters.some(n=>!isCompleted(p,n))||guest.journeyNext>p.journeyNext);
    if(signed)$('codePanel').hidden=true;
    $('historyIntro').textContent=signed?'Your best result and most recent clear for each stage.':'Your recent device history.';
    if(!signed)this.renderHistory(Object.values(p.records).sort((a,b)=>b.level-a.level),false);
  }
  renderHistory(rows,append=false){
    const list=$('historyList');if(!append)list.replaceChildren();
    for(const r of rows){const li=document.createElement('li'),title=document.createElement('b'),detail=document.createElement('span');title.textContent=`✓ Stage ${r.level}`;const time=Number(r.best_seconds??r.seconds)||0,peak=Number(r.peak_balls??r.peak)||1;detail.textContent=`${Math.round(time)}s · ${peak} peak balls · ${(r.play_mode??r.mode)==='watch'?'AUTO':'Manual'}`;li.append(title,detail);list.append(li);}
    if(!list.children.length){const li=document.createElement('li');li.textContent='Complete a stage to start your history.';list.append(li);}
  }
  async history(reset){
    $('historyPanel').hidden=false;
    if(!this.cloud.signedIn){this.renderHistory(Object.values(this.getProgress().records).sort((a,b)=>b.level-a.level));$('moreHistory').hidden=true;return;}
    if(reset)this.before=null;const owner=this.cloud.userId,page=await this.cloud.history(this.before);if(owner!==this.cloud.userId)return;this.renderHistory(page.history,!reset);this.before=page.nextBefore;$('moreHistory').hidden=!this.before;
  }
}
