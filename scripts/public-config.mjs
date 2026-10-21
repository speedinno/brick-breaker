const defaultGame='https://speedinno.github.io/brick-breaker/';
function secureUrl(value,message){let u;try{u=new URL(value);}catch{throw Error(message);}if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw Error(message);return u;}
export function validatePublicConfig(config){
 const missing=[];
 if(config.apiUrl)secureUrl(config.apiUrl,'Invalid API URL');
 if(Boolean(config.supabaseUrl)!==Boolean(config.publishableKey))throw Error('Provide both Supabase URL and public key');
 if(config.supabaseUrl){const u=secureUrl(config.supabaseUrl,'Invalid Supabase origin');if(u.pathname!=='/')throw Error('Supabase URL must be an origin');const key=config.publishableKey;
  if(typeof key!=='string'||key.length<21||key.startsWith('sb_secret_'))throw Error('Only a public Supabase publishable/anon key may enter the client');
  if(key.startsWith('eyJ')){try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role!=='anon')throw Error();}catch{throw Error('Only a public Supabase anon key may enter the client');}}
  else if(!key.startsWith('sb_publishable_'))throw Error('A Supabase publishable or anon key is required');
 }else missing.push('Owner-managed Supabase project and public configuration');
 const game=secureUrl(config.publicGameUrl||defaultGame,'Invalid public game URL');if(!game.pathname.endsWith('/'))throw Error('Public game URL must end in /');
 if(config.supportEmail){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.supportEmail))throw Error('Invalid support email');}else missing.push('Monitored public support email');
 if(!config.publisherName?.trim())missing.push('Legal publisher name');
 return missing;
}
