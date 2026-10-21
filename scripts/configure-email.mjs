import {createClient} from '@supabase/supabase-js';
import {pathToFileURL} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';

const email=value=>typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export async function configureEmail(settings,{fetcher=fetch,clientFactory=createClient,sendTest=false}={}){
  for(const name of ['SUPABASE_URL','SUPABASE_ACCESS_TOKEN','RESEND_API_KEY','AUTH_SENDER_EMAIL','SUPPORT_EMAIL'])if(!settings[name])throw Error('Missing '+name);
  for(const name of ['AUTH_SENDER_EMAIL','SUPPORT_EMAIL',...(sendTest?['TEST_EMAIL']:[])])if(!email(settings[name]))throw Error('Invalid '+name);
  const project=new URL(settings.SUPABASE_URL),ref=settings.SUPABASE_PROJECT_REF||project.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1];
  if(!ref||project.protocol!=='https:')throw Error('Cannot identify the Supabase project');
  const authUrl=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
  const managementHeaders={Authorization:'Bearer '+settings.SUPABASE_ACCESS_TOKEN,'Content-Type':'application/json'};
  const request=async(url,init,label)=>{
    const response=await fetcher(url,{...init,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(`${label} failed (HTTP ${response.status})`);
    return response.json();
  };
  const domains=await request('https://api.resend.com/domains',{headers:{Authorization:'Bearer '+settings.RESEND_API_KEY}},'Resend domain lookup');
  const domainName=settings.AUTH_SENDER_EMAIL.split('@')[1].toLowerCase(),domain=domains.data?.find(row=>row.name.toLowerCase()===domainName);
  if(!domain)throw Error('The sender domain must be registered in Resend first');
  // Validate before changing settings or sending mail. DNS verification is a
  // separate owner-controlled step, never bypassed with a different sender.
  if(sendTest&&domain.status!=='verified')throw Error('The sender domain is not verified yet; no test email was sent');
  const current=await request(authUrl,{headers:managementHeaders},'Supabase config lookup');
  if(current.hook_send_email_enabled)throw Error('An existing send-email hook is enabled; review it before switching to SMTP');
  const support=escape(settings.SUPPORT_EMAIL);
  const template=`<h2>Your Brick Breaker sign-in code</h2><p>Enter this code in the game:</p><p style="font-family:monospace;font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p><p>This code expires in 10 minutes. Do not share it.</p><p>If you did not request this code, you can ignore this email.</p><p>Need help? <a href="mailto:${support}">${support}</a></p>`;
  const patch={external_email_enabled:true,disable_signup:false,mailer_autoconfirm:false,smtp_host:'smtp.resend.com',smtp_port:'465',smtp_user:'resend',smtp_pass:settings.RESEND_API_KEY,smtp_admin_email:settings.AUTH_SENDER_EMAIL,smtp_sender_name:'Brick Breaker',mailer_otp_length:8,mailer_otp_exp:600,rate_limit_email_sent:Math.max(Number(current.rate_limit_email_sent)||0,30),mailer_subjects_confirmation:'Your Brick Breaker sign-in code',mailer_subjects_magic_link:'Your Brick Breaker sign-in code',mailer_templates_confirmation_content:template,mailer_templates_magic_link_content:template};
  await request(authUrl,{method:'PATCH',headers:managementHeaders,body:JSON.stringify(patch)},'Supabase SMTP update');
  const actual=await request(authUrl,{headers:managementHeaders},'Supabase config verification');
  for(const [key,value] of Object.entries(patch))if(key!=='smtp_pass'&&actual[key]!==value)throw Error('Supabase did not retain setting '+key);
  if(sendTest){
    const publicKey=settings.SUPABASE_PUBLISHABLE_KEY||settings.SUPABASE_ANON_KEY;
    if(!publicKey)throw Error('A public Supabase key is required to test email sign-in');
    const client=clientFactory(settings.SUPABASE_URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const result=await client.auth.signInWithOtp({email:settings.TEST_EMAIL,options:{shouldCreateUser:true}});
    if(result.error)throw Error(`Sign-in code request failed (${result.error.code||result.error.status||'provider error'})`);
  }
  return {smtpConfigured:true,provider:'Resend',senderDomain:domainName,senderDomainVerified:domain.status==='verified',otpLength:8,otpExpirySeconds:600,codeOnlyTemplates:true,testEmailRequested:sendTest,checkedAt:new Date().toISOString()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await configureEmail(process.env,{sendTest:process.argv.includes('--send-test')});
  await mkdir('.openai/local',{recursive:true});
  await writeFile('.openai/local/email-configuration.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
}
