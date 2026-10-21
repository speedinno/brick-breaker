import {writeFile} from 'node:fs/promises';
const url=(process.env.SUPABASE_URL||'').trim(),key=(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
if(Boolean(url)!==Boolean(key))throw Error('Provide both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
if(url){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.pathname!=='/'||parsed.username||parsed.password)throw Error('A secure Supabase project origin is required');}
if(key.startsWith('sb_secret_'))throw Error('Secret keys must never be bundled in the app');
if(key.startsWith('eyJ')){try{const payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));if(payload.role!=='anon')throw Error('Only the public anon key may be used');}catch{throw Error('A publishable key or legacy anon key is required');}}
const supportEmail=(process.env.SUPPORT_EMAIL||'').trim();if(supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail))throw Error('Invalid support email');
const config={supabaseUrl:url,publishableKey:key,supportEmail,publisherName:(process.env.PUBLISHER_NAME||'SpeedInno').trim(),privacyDate:'2026-10-21'};
await writeFile('dist/cloud-config.js','// Public configuration only. Generated from deployment environment.\nexport default Object.freeze('+JSON.stringify(config)+');\n');
console.log(JSON.stringify({cloudEnabled:Boolean(url),supportConfigured:Boolean(supportEmail),publisherConfigured:Boolean(config.publisherName)}));
