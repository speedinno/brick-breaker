const plugin='@capacitor-community/admob';
const appId=/^ca-app-pub-\d{16}~\d{10}$/;
const publisher=/^ca-pub-\d{16}$/;
const demoPublisher='3940256099942544';
function fields(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error('Unknown or invalid public ad configuration fields. Do not put private API keys in this file.');}
export function validateAdProfile(input){
 fields(input,['version','environment','audienceReviewed','android','ios','web']);
 if(input.version!==1||!['sandbox','production'].includes(input.environment)||typeof input.audienceReviewed!=='boolean')throw Error('Ad profile needs version 1, environment and audienceReviewed.');
 const platforms=[],result={enabled:false,audienceReviewed:input.audienceReviewed,environment:input.environment,platforms};
 for(const platform of ['android','ios'])if(input[platform]){
  const value=input[platform];fields(value,['appId','consentReviewed','skAdNetworkIds']);
  if(!appId.test(value.appId)||typeof value.consentReviewed!=='boolean')throw Error('Each native platform needs its own AdMob App ID and consentReviewed flag. An ad unit ID is not an App ID.');
  if(input.environment==='production'&&value.appId.includes(demoPublisher))throw Error('Google demo App IDs cannot be used in a production profile.');
  if(platform==='android'&&value.skAdNetworkIds!==undefined)throw Error('SKAdNetwork IDs apply only to iOS.');
  const ids=value.skAdNetworkIds??[];
  if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'||! /^[a-z0-9]{10}\.skadnetwork$/.test(id))||new Set(ids).size!==ids.length)throw Error('Invalid iOS SKAdNetwork identifiers.');
  platforms.push(platform);result[platform]={appId:value.appId,consentReviewed:value.consentReviewed,...(platform==='ios'?{skAdNetworkIds:ids}:{})};
 }
 if(input.web){
  const value=input.web;fields(value,['publisherId','cmpScriptUrl','origins','consentReviewed']);
  if(!publisher.test(value.publisherId)||typeof value.consentReviewed!=='boolean'||!Array.isArray(value.origins)||!value.origins.length||value.origins.length>20)throw Error('Web ads need a publisher ID, consentReviewed and owned origins.');
  const origins=value.origins.map(origin=>{let url;try{url=new URL(origin);}catch{throw Error('Invalid owned web origin.');}if(url.origin!==origin||url.username||url.password||!(url.protocol==='https:'||input.environment==='sandbox'&&['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:'))throw Error('Use exact HTTPS owned origins, or sandbox localhost.');return origin;});
  let cmp;try{cmp=new URL(value.cmpScriptUrl);}catch{throw Error('Copy the Google Privacy & messaging script URL from the publisher console.');}
  if(cmp.protocol!=='https:'||cmp.hostname!=='fundingchoicesmessages.google.com'||cmp.username||cmp.password||cmp.port||cmp.hash||cmp.pathname!=='/i/pub-'+value.publisherId.slice(7)||[...cmp.searchParams].some(([key,value])=>key!=='ers'||value!=='1')||[...cmp.searchParams].length>1)throw Error('CMP URL must be the official Google Privacy & messaging tag for this publisher.');
  if(input.environment==='production'&&value.publisherId.includes(demoPublisher))throw Error('A production publisher ID is required.');
  platforms.push('web');result.web={publisherId:value.publisherId,cmpScriptUrl:cmp.href,origins:[...new Set(origins)],consentReviewed:value.consentReviewed};
 }
 if(!platforms.length)throw Error('Choose at least one platform, or use --disable.');
 if(input.environment==='production'&&(!input.audienceReviewed||platforms.some(platform=>!result[platform].consentReviewed)))throw Error('Review the target audience and each platform consent configuration before production activation.');
 result.enabled=input.audienceReviewed&&platforms.every(platform=>result[platform].consentReviewed);return result;
}
const markers={android:['<!-- SpeedInno managed ads: start -->','<!-- SpeedInno managed ads: end -->'],ios:['<!-- SpeedInno managed ads: start -->','<!-- SpeedInno managed ads: end -->']};
function strip(source,platform){const [start,end]=markers[platform],a=source.indexOf(start),b=source.indexOf(end);if((a<0)!==(b<0)||a>=0&&b<a)throw Error('Repair the managed ad configuration markers before continuing.');if(a<0)return source;const line=source.lastIndexOf('\n',a)+1,from=/^[\t ]*$/.test(source.slice(line,a))?line:a;let to=b+end.length;if(source.slice(to,to+2)==='\r\n')to+=2;else if(source[to]==='\n')to++;return source.slice(0,from)+source.slice(to);}
export function profileFiles({capacitor,manifest,plist},profile){
 const config=structuredClone(capacitor),base=(config.includePlugins||[]).filter(name=>name!==plugin);
 if(!base.length)throw Error('The explicit base Capacitor plugin list is required.');config.includePlugins=base;
 for(const platform of ['android','ios']){
  config[platform]??={};const list=(config[platform].includePlugins||base).filter(name=>name!==plugin);
  if(profile?.[platform])config[platform].includePlugins=[...new Set([...list,plugin])];
  else if(JSON.stringify(list)===JSON.stringify(base))delete config[platform].includePlugins;
  else config[platform].includePlugins=list;
 }
 manifest=strip(manifest,'android');plist=strip(plist,'ios');
 if(/com\.google\.android\.gms\.ads\.(APPLICATION_ID|DELAY_APP_MEASUREMENT_INIT)/.test(manifest)||/<key>(GADApplicationIdentifier|GADDelayAppMeasurementInit|SKAdNetworkItems)<\/key>/.test(plist))throw Error('Unmanaged native ad settings already exist. Move them into the public profile before continuing.');
 if(profile?.android){
  const text=markers.android[0]+'\n<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="'+profile.android.appId+'"/>\n<meta-data android:name="com.google.android.gms.ads.DELAY_APP_MEASUREMENT_INIT" android:value="true"/>\n'+markers.android[1];
  if(!manifest.includes('</application>'))throw Error('Android application manifest is missing.');manifest=manifest.replace(/^([\t ]*)<\/application>/m,(_,indent)=>text.split('\n').map(line=>indent+line).join('\n')+'\n'+indent+'</application>');
 }
 if(profile?.ios){
  const networks=profile.ios.skAdNetworkIds.map(id=>'<dict><key>SKAdNetworkIdentifier</key><string>'+id+'</string></dict>').join('\n');
  const text=markers.ios[0]+'\n<key>GADApplicationIdentifier</key><string>'+profile.ios.appId+'</string>\n<key>GADDelayAppMeasurementInit</key><true/>\n'+(networks?'<key>SKAdNetworkItems</key><array>'+networks+'</array>\n':'')+markers.ios[1];
  const position=plist.lastIndexOf('</dict>');if(position<0)throw Error('iOS Info.plist dictionary is missing.');plist=plist.slice(0,position)+text+'\n'+plist.slice(position);
 }
 const runtime=profile||{enabled:false,audienceReviewed:false,platforms:[]};
 return{capacitor:JSON.stringify(config,null,2)+'\n',manifest,plist,runtime:'// Generated public settings: npm run configure:ads. No private API keys.\nexport default '+JSON.stringify(runtime,null,2)+';\n'};
}
