const $ = id => document.getElementById(id);
const seconds = ms => (ms / 1000).toLocaleString(undefined, {maximumFractionDigits: 3});
export class AssistancePanel {
  constructor({bank, cloud, open, close, signIn, activate}) {
    Object.assign(this, {bank, cloud, open, close, activate}); this.busy = false; this.epoch = 0;
    $('assistSignIn').onclick = () => { this.close('assist'); signIn(); };
    $('assistRefresh').onclick = () => void this.refresh();
    for (const ms of [15000, 30000]) $('assist' + ms).onclick = () => void this.start(ms);
    $('assistRemainder').onclick = () => void this.start(Math.floor(this.bank.wallet?.availableMs || 0));
  }
  message(text, error = false) { $('assistMessage').textContent = text; $('assistMessage').classList.toggle('error', error); }
  render() {
    const signedIn = this.cloud.signedIn, wallet = this.bank.wallet;
    const balance = Number.isSafeInteger(wallet?.availableMs) && wallet.availableMs >= 0 ? wallet.availableMs : 0;
    const pending=Boolean(wallet?.pending?.length||this.bank.journal||this.bank.starting);
    $('assistSignIn').hidden = signedIn;
    $('assistRefresh').hidden = !signedIn;
    $('assistBalance').textContent = signedIn && wallet ? `${seconds(balance)} seconds available` : signedIn ? 'Loading your time bank…' : 'Sign in to protect your time bank across devices.';
    for (const ms of [15000, 30000]) $('assist' + ms).disabled = this.busy || !signedIn || balance < ms || pending;
    const small = balance > 0 && balance < 15000;
    $('assistRemainder').hidden = !small; $('assistRemainder').textContent = `Use remaining ${seconds(balance)} seconds`;
    $('assistRemainder').disabled = this.busy || pending;
    $('assistRefresh').disabled = this.busy;
    const list = $('assistPending'); list.replaceChildren();
    for (const pending of wallet?.pending || []) {
      const item = document.createElement('div'), text = document.createElement('p'), button = document.createElement('button');
      text.textContent = 'Time is reserved by a previous activation. Recover it after its short authorization lease ends.';
      button.className = 'secondary full'; button.textContent = 'Recover pending time'; button.disabled = this.busy;
      button.onclick = () => void this.recover(pending.id); item.append(text, button); list.append(item);
    }
    $('assistSetup').hidden = balance > 0;
  }
  show() { this.open('assist'); this.message(''); this.render(); if (this.cloud.signedIn) void this.refresh(); }
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
    if (this.busy) return;
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
