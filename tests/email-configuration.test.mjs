import test from 'node:test';
import assert from 'node:assert/strict';
import {configureEmail} from '../scripts/configure-email.mjs';

const settings={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ACCESS_TOKEN:'management-test',RESEND_API_KEY:'resend-test',AUTH_SENDER_EMAIL:'login@example.test',SUPPORT_EMAIL:'support@example.test',TEST_EMAIL:'owned-inbox@example.test',SUPABASE_PUBLISHABLE_KEY:'public-test'};
function backend({verified=true,hook=false}={}){
  let config={hook_send_email_enabled:hook,rate_limit_email_sent:2},patch=null;
  const fetcher=async(url,init)=>{
    if(url==='https://api.resend.com/domains')return Response.json({data:[{name:'example.test',status:verified?'verified':'pending'}]});
    assert.equal(url,'https://api.supabase.com/v1/projects/example/config/auth');
    if(init.method==='PATCH'){patch=JSON.parse(init.body);config={...config,...patch};}
    return Response.json(config);
  };
  return {fetcher,get patch(){return patch;}};
}
test('SMTP setup patches code-only signup/login templates and preserves unrelated settings',async()=>{
  const mock=backend();
  const result=await configureEmail(settings,{fetcher:mock.fetcher});
  assert.equal(mock.patch.smtp_pass,settings.RESEND_API_KEY);assert.equal(mock.patch.smtp_host,'smtp.resend.com');
  assert.equal(mock.patch.smtp_port,'465');assert.equal(mock.patch.mailer_otp_length,8);assert.equal(mock.patch.mailer_otp_exp,600);
  for(const key of ['mailer_templates_confirmation_content','mailer_templates_magic_link_content']){assert(mock.patch[key].includes('{{ .Token }}'));assert(!mock.patch[key].includes('ConfirmationURL'));}
  assert.equal(mock.patch.rate_limit_email_sent,30);assert.equal(mock.patch.mailer_autoconfirm,false);assert.equal(mock.patch.site_url,undefined);assert.equal(mock.patch.security_captcha_enabled,undefined);
  assert.equal(result.testEmailRequested,false);assert(!JSON.stringify(result).includes(settings.RESEND_API_KEY));assert(!JSON.stringify(result).includes(settings.SUPABASE_ACCESS_TOKEN));
});
test('SMTP setup sends only to the supplied test inbox when explicitly requested',async()=>{
  const mock=backend();let sent;
  const result=await configureEmail(settings,{fetcher:mock.fetcher,sendTest:true,clientFactory:(_url,key)=>{assert.equal(key,settings.SUPABASE_PUBLISHABLE_KEY);return {auth:{signInWithOtp:async body=>{sent=body;return {};}}};}});
  assert.equal(sent.email,settings.TEST_EMAIL);assert.equal(sent.options.shouldCreateUser,true);assert.equal(result.testEmailRequested,true);
});
test('Unverified senders and existing hooks cannot trigger a test or overwrite SMTP routing',async()=>{
  const pending=backend({verified:false});await assert.rejects(()=>configureEmail(settings,{fetcher:pending.fetcher,sendTest:true}),/not verified/);assert.equal(pending.patch,null);
  const hooked=backend({hook:true});await assert.rejects(()=>configureEmail(settings,{fetcher:hooked.fetcher}),/existing send-email hook/);assert.equal(hooked.patch,null);
});
