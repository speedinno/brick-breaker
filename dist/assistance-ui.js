const $ = id => document.getElementById(id);
const seconds = ms => (ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 3});
export class AssistancePanel {
  constructor({bank, cloud, open, close, signIn, activate}) {
    Object.assign(this, {bank, cloud, open, close, activate}); this.busy = false; this.epoch = 0;
    $('assistSignIn').onclick = () => { this.close('assist'); signIn(); };
    $('assistRefresh').onclick = () => void this.refresh();
    $('assistRemainder').onclick = () => void this.start(Math.floor(this.bank.wallet?.availableMs || 0));
  }
  message(text, error = false) { $('assistMessage').textContent = text; $('assistMessage').classList.toggle('error', error); }
  render() {
    const signedIn = this.cloud.signedIn, wallet = this.bank.wallet;
    const balance = Number.isSafeInteger(wallet?.availableMs) && wallet.availableMs >= 0 ? wallet.availableMs : 0;
    const pending=Boolean(wallet?.pending?.length||this.bank.journal||this.bank.starting||this.checkoutBusy);
    $('assistSignIn').hidden = signedIn;
    $('assistRefresh').hidden = !signedIn;
    $('assistBalance').textContent = signedIn && wallet ? `${seconds(balance)} seconds available` : signedIn ? 'Loading your time bank…' : 'Sign in to protect your time bank across devices.';
    const configured=wallet?.config?.activationMs;
    const choices=Array.isArray(configured)?[...new Set(configured.filter(ms=>Number.isSafeInteger(ms)&&ms>0&&ms<=30000))]:[15000,30000];
    const buttons=$('assistActivations');buttons.replaceChildren();
    for(const ms of choices){const button=document.createElement('button');button.id='assist'+ms;button.className='primary';button.textContent=`Use ${seconds(ms)} seconds`;button.disabled=this.busy||!signedIn||balance<ms||pending;button.onclick=()=>void this.start(ms);buttons.append(button);}
    const small = choices.length>0 && balance > 0 && balance < Math.min(...choices);
    $('assistRemainder').hidden = !small; $('assistRemainder').textContent = `Use remaining ${seconds(balance)} seconds`;
    $('assistRemainder').disabled = this.busy || pending;
    $('assistRefresh').disabled = this.busy||this.checkoutBusy;
    const list = $('assistPending'); list.replaceChildren();
    for (const pending of wallet?.pending || []) {
      const item = document.createElement('div'), text = document.createElement('p'), button = document.createElement('button');
      text.textContent = 'Time is reserved by a previous activation. Recover it after its short authorization lease ends.';
      button.className = 'secondary full'; button.textContent = 'Recover pending time'; button.disabled = this.busy;
      button.onclick = () => void this.recover(pending.id); item.append(text, button); list.append(item);
    }
    const cfg=wallet?.config;
    $('assistSetup').hidden=!signedIn||!cfg;
    if(cfg){
      const intro=wallet.introClaimed?'':`First recorded manual clear: ${seconds(cfg.introMs)} seconds once. `;
      const reset=new Date(wallet.nextReset).toLocaleString(undefined,{hour:'numeric',minute:'2-digit',day:'numeric',month:'short'});
      $('assistSetup').textContent=`${intro}Clear a different stage manually to earn ${seconds(cfg.manualMs)} seconds. ${wallet.manualRewardsRemaining} of ${cfg.manualPerDay} rewards left until ${reset} (midnight UTC). Rewards need a signed-in run started online. Assisted clears and imports do not earn time. Manual play stays free after the limit.`;
    }
    this.purchases?.render();
  }
  show() { this.open('assist'); this.message(''); this.render(); if (this.cloud.signedIn) void this.refresh().then(()=>this.purchases?.load()); }
  async refresh() {
    if (this.busy) return;
    const epoch = ++this.epoch, bank = this.bank; this.busy = true; this.render();
    try {
      if (bank.flushing) await bank.flushing;
      await bank.refresh();
      await bank.recoverLocal();
      await bank.refresh();
      if (epoch === this.epoch) this.message('Time bank updated.');
    } catch (error) { if (epoch === this.epoch) this.message(error.message==='Unknown action'?'The time bank is not enabled on the server yet. Manual play is available.':error.message, true); }
    finally { if (epoch === this.epoch) { this.busy = false; this.render(); } }
  }
  async start(ms) {
    if (this.busy||this.checkoutBusy) return;
    const epoch = this.epoch;
    this.busy = true; this.message('Authorizing this activation…'); this.render();
    try { await this.activate(ms); }
    catch (error) { if(epoch===this.epoch)this.message(error.message, true); }
    finally { if(epoch===this.epoch){this.busy = false; this.render();} }
  }
  async recover(id) {
    if (this.busy) return;
    const epoch=this.epoch,bank=this.bank;
    this.busy = true; this.render();
    try { await bank.recoverRemote(id); await bank.refresh(); if(epoch===this.epoch)this.message('Unused reserved time returned.'); }
    catch (error) { if(epoch===this.epoch)this.message(error.message, true); }
    finally { if(epoch===this.epoch){this.busy = false; this.render();} }
  }
}
