// Disposable local QA only. It never contacts Google or represents a real ad.
globalThis.__qaH5Load=async()=>({config(){},break(options){
 queueMicrotask(()=>options.beforeReward(()=>{
  options.beforeAd();const sheet=document.createElement('section');sheet.id='qaAd';
  sheet.style='position:fixed;z-index:2147483647;inset:10px;display:grid;place-content:center;gap:14px;background:#20252d;padding:24px;border:2px solid #ffc095;border-radius:18px;color:#fff';
  const title=document.createElement('h2');title.textContent='Local mock ad · no publisher request';
  const complete=document.createElement('button');complete.id='qaAdComplete';complete.textContent='Simulate completed viewing';
  const dismiss=document.createElement('button');dismiss.id='qaAdDismiss';dismiss.textContent='Simulate early dismissal';
  complete.onclick=()=>{options.adViewed();options.adViewed();sheet.remove();options.afterAd();options.adBreakDone({breakStatus:'viewed'});};
  dismiss.onclick=()=>{options.adDismissed();sheet.remove();options.afterAd();options.adBreakDone({breakStatus:'dismissed'});};
  sheet.append(title,complete,dismiss);document.body.append(sheet);
 }));
}});
