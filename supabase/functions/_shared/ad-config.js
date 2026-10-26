export function rewardedAdConfig(env){
 try{
  const value=JSON.parse(env('REWARDED_ADS_CONFIG_JSON')||'null');if(!value||!['production','sandbox'].includes(value.environment))return null;
  const placements={};for(const platform of ['android','ios','web']){const id=value[platform]?.placement;if(id!==undefined){if(typeof id!=='string'||!/^[a-z0-9_-]{1,80}$/.test(id))return null;placements[platform]=id;}}
  const origins=new Set();for(const raw of value.web?.origins||[]){const url=new URL(raw);if(url.origin!==raw||url.protocol!=='https:'&&!(value.environment==='sandbox'&&url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))return null;origins.add(raw);}
  return{environment:value.environment,placements,origins};
 }catch{return null;}
}
export async function adPlacement(config,admin,platform,origin){
 if(!config?.placements[platform]||platform==='web'&&!config.origins.has(origin||''))return null;
 const result=await admin.from('game_ad_placements').select('*').eq('id',config.placements[platform]).eq('platform',platform).eq('environment',config.environment).eq('active',true).maybeSingle();
 if(result.error)throw Error('Reward placements are unavailable');const row=result.data;if(!row)return null;
 if(platform==='web'?(row.provider!=='h5'||!/^ca-pub-\d{16}$/.test(row.request_unit)):(row.provider!=='admob'||!/^ca-app-pub-\d{16}\/\d{6,16}$/.test(row.request_unit)))return null;
 return row;
}
