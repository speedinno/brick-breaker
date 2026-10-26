// This class accounts for a server-issued reservation. It never grants credit,
// trusts a cached bank as authorization, or resumes assistance from a save.
const isUuid = value => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
const isMs = value => Number.isSafeInteger(value) && value >= 0 && value <= 30000;

export class AssistanceSession {
  constructor({storage, api, account, deviceId, now = () => performance.now(), uuid = () => crypto.randomUUID(), onStop = () => {}}) {
    if (!isUuid(deviceId)) throw Error('Invalid activation device');
    Object.assign(this, {storage, api, account, deviceId, now, uuid, onStop});
    this.active = false; this.journal = null; this.wallet = null; this.error = null;
    this.flushing = null; this.scheduled = false; this.deadline = 0;
    this.starting = false; this.epoch = 0;
  }
  key(owner) { return 'brick-breaker-assistance-v1:' + owner; }
  read(owner = this.account()) {
    const raw = this.storage.getItem(this.key(owner));
    if (raw === null) return null;
    let record; try { record = JSON.parse(raw); } catch { throw Error('The local time record needs recovery. Refresh your time bank.'); }
    if (!record || record.version !== 1 || record.owner !== owner || record.deviceId !== this.deviceId || !isUuid(record.id) || !isUuid(record.runId) || !isMs(record.reservedMs) || record.reservedMs < 1 || !isMs(record.usedMs) || record.usedMs > record.reservedMs || !(record.fraction >= 0 && record.fraction < 1) || !['requesting','authorized','stopping'].includes(record.status)) throw Error('The local time record needs recovery. Refresh your time bank.');
    return record;
  }
  persist(record = this.journal) {
    if (record) this.storage.setItem(this.key(record.owner), JSON.stringify(record));
  }
  remainingMs() { return this.journal ? Math.max(0, this.journal.reservedMs - this.journal.usedMs - this.journal.fraction) : 0; }
  updateLease(result, started) {
    const record = result?.reservation;
    if (!record || record.id !== this.journal?.id || record.user_id !== this.journal.owner || record.device_id !== this.deviceId || record.run_id !== this.journal.runId || record.reserved_ms !== this.journal.reservedMs || !isMs(record.consumed_ms)) throw Error('Invalid time authorization');
    const serverTime = Date.parse(result.wallet?.serverNow), end = Date.parse(record.lease_until);
    if (!Number.isFinite(serverTime) || !Number.isFinite(end)) throw Error('Invalid time authorization');
    // Subtract the complete request round-trip and another 50ms. Client wall
    // clock changes cannot extend authority; a delayed response shortens it.
    const roundTrip = Math.max(0, this.now() - started);
    this.deadline = this.now() + Math.max(0, end - serverTime - roundTrip - 50);
    if (record.consumed_ms > this.journal.usedMs) { this.journal.usedMs = record.consumed_ms; this.journal.fraction = 0; }
    this.wallet = result.wallet;
    return record;
  }
  async start(runId, milliseconds) {
    const owner = this.account();
    if (!isUuid(owner)) throw Error('Sign in to protect your shared time bank. Manual play needs no account.');
    if (!isUuid(runId) || !isMs(milliseconds) || milliseconds < 1) throw Error('Invalid activation');
    if (this.active || this.journal || this.read(owner)) throw Error('Reconcile the previous activation before starting another.');
    const record = {version: 1, id: this.uuid(), owner, deviceId: this.deviceId, runId, reservedMs: milliseconds, usedMs: 0, fraction: 0, status: 'requesting'};
    // An uncertain network response must still have a durable request identity.
    this.persist(record); this.journal = record; this.error = null; this.starting = true;
    const epoch = ++this.epoch;
    const started = this.now();
    try {
      const result = await this.api('reserve', {reservationId: record.id, deviceId: this.deviceId, runId, milliseconds});
      if (this.account() !== owner) throw Error('Your account changed. Recover this activation after signing back in.');
      const authorization = this.updateLease(result, started);
      if (authorization.settled_at) throw Error('This activation is already settled. Refresh your time bank.');
      if (epoch !== this.epoch) {
        record.status = 'stopping'; this.starting = false; await this.flush();
        throw Error('Activation cancelled. Your unused time was returned.');
      }
      record.status = 'authorized'; this.persist();
      if (this.deadline <= this.now() || !this.remainingMs()) {
        record.status = 'stopping'; this.starting = false; await this.flush(); throw Error('Authorization arrived too late. Your unused time was returned. Try again.');
      }
      this.active = true; return result;
    } catch (error) { this.error = error; throw error; }
    finally { this.starting = false; }
  }
  allowance(milliseconds, eligible) {
    if (!this.active || !eligible || !Number.isFinite(milliseconds) || milliseconds <= 0) return 0;
    if (this.now() >= this.deadline) { this.stop('authorization'); return 0; }
    return Math.min(milliseconds, this.remainingMs());
  }
  consume(milliseconds, eligible) {
    const amount = this.allowance(milliseconds, eligible);
    if (!amount) return 0;
    const r = this.journal, exact = r.fraction + amount;
    const whole = Math.floor(exact + 1e-9);
    r.usedMs = Math.min(r.reservedMs, r.usedMs + whole);
    r.fraction = Math.max(0, exact - whole);
    if (r.usedMs === r.reservedMs) r.fraction = 0;
    if (!this.remainingMs()) this.stop('expired');
    return amount;
  }
  stop(reason, schedule = true) {
    if (this.starting && !this.active) {
      ++this.epoch;
      if (this.journal) { this.journal.status = 'stopping'; this.journal.reason = reason; }
      return;
    }
    if (!this.active) return;
    this.active = false;
    if (this.journal) { this.journal.status = 'stopping'; this.journal.reason = reason; }
    this.onStop(reason);
    if (schedule && !this.scheduled) {
      this.scheduled = true;
      // The simulation/input hot path does arithmetic and ownership changes
      // only. Durable writes and network activity happen after that stack.
      queueMicrotask(() => { this.scheduled = false; void this.flush().catch(() => {}); });
    }
  }
  async flush() {
    if (this.starting) return null;
    if (this.flushing) { await this.flushing; return this.flush(); }
    if (!this.journal) return null;
    const record = this.journal;
    const perform = async () => {
      try {
        this.persist(record);
        if (this.account() !== record.owner) { this.stop('account', false); throw Error('Sign back in to reconcile the previous account’s time.'); }
        const final = !this.active;
        const started = this.now();
        const result = await this.api(final ? 'settle' : 'checkpoint', {reservationId: record.id, deviceId: this.deviceId, consumedMs: record.usedMs});
        this.updateLease(result, started);
        if (result.reservation.settled_at) {
          if (this.active) this.stop('reconciled', false);
          this.storage.removeItem(this.key(record.owner)); this.journal = null;
        } else {
          this.persist(record);
          if (result.authorizationValid === false) this.stop('revoked');
        }
        this.error = null; return result;
      } catch (error) { this.error = error; this.stop('connection', false); throw error; }
    };
    this.flushing = perform();
    try { return await this.flushing; } finally { this.flushing = null; }
  }
  async refresh() {
    const owner = this.account();
    if (!isUuid(owner)) { this.wallet = null; return null; }
    const state = await this.api('state');
    if (owner !== this.account()) throw Error('Your account changed. Reopen your time bank.');
    this.wallet = state;
    return state;
  }
  async recoverLocal() {
    if (this.active || this.starting) throw Error('Take control before recovering an activation.');
    let record;
    try{record=this.read();}
    catch(error){
      // An unreadable journal is not a reason to strand server-owned time.
      // Keep it while authority is pending; only authoritative absence allows
      // discarding that corrupt cache. No credit is created by this cleanup.
      const wallet=await this.refresh();
      if(wallet.pending?.length)throw error;
      this.storage.removeItem(this.key(this.account()));this.journal=null;return wallet;
    }
    if (!record) return this.refresh();
    this.journal = {...record, status: 'stopping'};
    // Recovery never starts AI. A missing/uncertain start response is resolved
    // against server state first, not interpreted as an unused local grant.
    const wallet = await this.refresh();
    if (!wallet.pending.some(item => item.id === record.id)) {
      this.storage.removeItem(this.key(record.owner)); this.journal = null; return wallet;
    }
    return this.flush();
  }
  async recoverRemote(reservationId) {
    if (!isUuid(reservationId) || this.active) throw Error('Invalid recovery request');
    const owner=this.account();
    const result = await this.api('recover', {reservationId});
    if(owner!==this.account())throw Error('Your account changed. Reopen your time bank.');
    this.wallet = result.wallet;
    if(result.reservation?.settled_at&&this.journal?.id===reservationId){this.storage.removeItem(this.key(owner));this.journal=null;}
    return result;
  }
}
