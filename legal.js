import config from './cloud-config.js';
for(const el of document.querySelectorAll('[data-publisher]'))el.textContent=config.publisherName||'SpeedInno';
for(const el of document.querySelectorAll('[data-support]')){el.href=config.supportEmail?'mailto:'+config.supportEmail:'https://github.com/speedinno/brick-breaker/issues';el.textContent=config.supportEmail||'Contact the project support team';}
for(const el of document.querySelectorAll('[data-cloud-status]'))el.textContent=config.supabaseUrl?'Optional cloud accounts are enabled for this deployment.':'Cloud accounts are not enabled in this deployment. Guest play and device saves are available.';
