// Disposable localhost fixture. This intercepts the exact CMP tag before DOM
// insertion: no Google script/network request or genuine consent is involved.
(()=>{
 const append=document.head.append.bind(document.head);let decision=null,visible=false,id=0,started=false;
 const tcf=new Map(),gpp=new Map(),waiting=[];let fc;
 const ping=()=>({cmpStatus:'loaded',signalStatus:'ready',cmpDisplayStatus:visible?'visible':'hidden',applicableSections:[-1],supportedAPIs:[],parsedSections:{}});
 const emit=event=>{for(const [listenerId,callback]of [...tcf])callback({listenerId,gdprApplies:true,eventStatus:event},true);for(const [listenerId,callback]of [...gpp])callback({listenerId,pingData:ping()},true);};
 const deliver=()=>{for(const item of [...waiting]){const key=Object.keys(item)[0];if(key==='CONSENT_API_READY'||decision!==null){waiting.splice(waiting.indexOf(item),1);item[key]();}}};
 function show(){
  visible=true;const panel=document.createElement('section');panel.id='qaConsent';panel.style='position:fixed;z-index:2147483647;inset:12px;background:#20252d;border:2px solid #ffc095;border-radius:18px;padding:28px;color:#fff;display:grid;align-content:center;gap:18px';
  const title=document.createElement('h2');title.textContent='Local mock privacy form · no Google request';
  const allow=document.createElement('button');allow.id='qaConsentAllow';allow.textContent='Simulate consent granted';const deny=document.createElement('button');deny.id='qaConsentDeny';deny.textContent='Simulate consent denied';
  const finish=value=>{decision=value;visible=false;panel.remove();emit('useractioncomplete');deliver();};allow.onclick=()=>finish(true);deny.onclick=()=>finish(false);panel.append(title,allow,deny);document.body.append(panel);emit('cmpuishown');
 }
 window.__tcfapi=(command,version,callback,parameter)=>{if(command==='addEventListener'){const listener=++id;tcf.set(listener,callback);callback({listenerId:listener,gdprApplies:true,eventStatus:visible?'cmpuishown':'tcloaded'},true);}else{tcf.delete(parameter);callback(true);}};
 window.__gpp=(command,callback,parameter)=>{if(command==='ping')callback(ping(),true);else if(command==='addEventListener'){const listener=++id;gpp.set(listener,callback);callback({listenerId:listener,pingData:ping()},true);}else{gpp.delete(parameter);callback(true);}};
 document.head.append=(...nodes)=>{
  for(const node of nodes){if(node.tagName==='SCRIPT'&&node.src.startsWith('https://fundingchoicesmessages.google.com/i/')){
   if(started)throw Error('Duplicate CMP tag');started=true;fc=window.googlefc;waiting.push(...fc.callbackQueue);fc.callbackQueue={push:item=>{waiting.push(item);queueMicrotask(deliver);}};
   fc.ConsentModePurposeStatusEnum={UNKNOWN:0,GRANTED:1,DENIED:2,NOT_APPLICABLE:3,NOT_CONFIGURED:4};fc.getGoogleConsentModeValues=()=>({adStoragePurposeConsentStatus:decision?1:2,adUserDataPurposeConsentStatus:decision?1:2,adPersonalizationPurposeConsentStatus:decision?1:2});fc.showRevocationMessage=show;
   queueMicrotask(()=>{show();deliver();node.onload();});
  }else append(node);}
 };
})();
