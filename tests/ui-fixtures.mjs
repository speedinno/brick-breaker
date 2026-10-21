// Explicit opt-in development fixtures. Never included in dist or native apps.
export function fixturePage(scenario){
  const count=scenario==='eleven'?11:scenario==='journey'?12:0;
  const progress={version:3,starters:Array.from({length:count},(_,i)=>i+1),journeyNext:scenario==='journey'?14:13,records:{},selected:count===12?14:count+1,best:0,pending:[],updatedAt:Date.now()};
  return `<!doctype html><title>Disposable QA fixture</title><style>body{background:#292430;color:white;font:18px system-ui;padding:30px}button{padding:20px}</style><h1>Disposable QA fixture</h1><p>${scenario}: simulated completion data for interface verification.</p><button id="load">Load fixture and open game</button><script>document.querySelector('button').onclick=()=>{localStorage.removeItem('brick-breaker-session-v3:guest');localStorage.setItem('brick-breaker-v3:guest',${JSON.stringify(JSON.stringify(progress))});location.href='/';};</script>`;
}
