import test from 'node:test';import assert from 'node:assert/strict';import {contributionReport,components} from '../scripts/contribution-model.mjs';
import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
function fixture(){const kinds={adProceeds:'publisher_report',purchaseProceeds:'purchase_report'},evidence=components.map(id=>({id:id.toLowerCase(),kind:kinds[id]??'cost_record',sha256:'a'.repeat(64),bytes:10}));evidence.push({id:'acquired',kind:'acquisition_report',sha256:'b'.repeat(64),bytes:20});
 const flows=Object.fromEntries(components.map(name=>[name,{currency:'INR',micros:name==='adProceeds'?'10000000':name==='purchaseProceeds'?'20000000':'1000000',coverage:'complete',finality:'final',evidence:[name.toLowerCase()]}]));return{version:1,asOf:'2026-10-08',evidence,cohorts:[{id:'cohort-1',day:'2026-10-01',windowDays:7,platform:'android',reportedCountry:'IN',identityBasis:'reviewed_unique_acquired_players',acquiredCount:10,countCoverage:'complete',countEvidence:['acquired'],attribution:'cohort_measured',reviewed:true,flows}]};}
const row=input=>contributionReport(input).cohorts[0];
test('D7 actual net components yield exact integer contribution and a rational per-new-player measure',()=>{
 const result=contributionReport(fixture()),r=result.cohorts[0];assert.equal(r.status,'reviewed_observation');assert.equal(r.windowContributionMicros,'25000000');assert.deepEqual(r.netContributionPerNewPlayer,{numeratorMicros:'25000000',denominatorPlayers:'10'});assert.equal(r.endExclusive,'2026-10-08');assert.equal(result.overallProfit,null);
});
test('any unknown or partial cost, including an apparently trivial missing hosting bill, prevents a complete result',()=>{
 for(const component of components){const input=fixture();Object.assign(input.cohorts[0].flows[component],{coverage:'unknown',micros:null,evidence:[]});const r=row(input);assert.equal(r.status,'incomplete');assert.equal(r.windowContributionMicros,null);assert.equal(r.netContributionPerNewPlayer,null);assert.deepEqual(r.unknownComponents,[component]);}
 const input=fixture();input.cohorts[0].flows.supportCost.coverage='partial';assert.equal(row(input).windowContributionMicros,null);assert.deepEqual(row(input).partialComponents,['supportCost']);
});
test('reviewed zero costs are distinct from unknown and net provider proceeds are used once without another platform deduction',()=>{
 const input=fixture();for(const name of components.slice(2))input.cohorts[0].flows[name].micros='0';assert.equal(row(input).windowContributionMicros,'30000000');input.evidence.find(e=>e.id==='hostingcost').kind='reviewed_zero';assert.equal(row(input).windowContributionMicros,'30000000');input.cohorts[0].flows.hostingCost.micros='1';assert.throws(()=>row(input),/Invalid reviewed/);delete input.cohorts[0].flows.hostingCost;assert.throws(()=>row(input),/Invalid reviewed/);
});
test('mixed currencies stay separate with no invented exchange rate; negative proceeds and large integers remain exact',()=>{
 const input=fixture();input.cohorts[0].flows.adProceeds.currency='USD';let r=row(input);assert.equal(r.currency,null);assert.equal(r.windowContributionMicros,null);assert.deepEqual(r.knownSubtotalByCurrency,[{currency:'INR',contributionMicros:'15000000'},{currency:'USD',contributionMicros:'10000000'}]);
 input.cohorts[0].flows.adProceeds.currency='INR';input.cohorts[0].flows.purchaseProceeds.micros='-99999999999999999999999';r=row(input);assert.equal(r.windowContributionMicros,'-99999999999999994999999');input.cohorts[0].flows.acquisitionCost.micros='-1';assert.throws(()=>row(input),/Invalid reviewed/);
});
test('estimated publisher money, calendar allocations and install/consent counts cannot masquerade as observed contribution per new player',()=>{
 const input=fixture();input.cohorts[0].flows.adProceeds.finality='estimate';let r=row(input);assert.equal(r.status,'estimate');assert.equal(r.estimatedWindowContributionMicros,'25000000');assert.equal(r.windowContributionMicros,null);assert.equal(r.netContributionPerNewPlayer,null);assert.equal(r.estimateRatio.denominatorCount,'10');
 input.cohorts[0].flows.adProceeds.finality='final';input.cohorts[0].attribution='allocated_calendar_total';assert.equal(row(input).status,'estimate');
 input.cohorts[0].attribution='cohort_measured';for(const basis of ['store_install_events','consenting_accounts']){input.cohorts[0].identityBasis=basis;r=row(input);assert.equal(r.netContributionPerNewPlayer,null);assert.equal(r.estimateRatio.denominatorBasis,basis);}
});
test('immature, unreviewed and zero/unknown denominators cannot produce a per-player outcome',()=>{
 const input=fixture();input.asOf='2026-10-07';assert.equal(row(input).windowMature,false);assert.equal(row(input).windowContributionMicros,null);input.asOf='2026-10-08';input.cohorts[0].reviewed=false;assert.equal(row(input).windowContributionMicros,null);
 input.cohorts[0].reviewed=true;input.cohorts[0].acquiredCount=0;assert.equal(row(input).netContributionPerNewPlayer,null);Object.assign(input.cohorts[0],{acquiredCount:null,countCoverage:'unknown',countEvidence:[]});assert.equal(row(input).netContributionPerNewPlayer,null);
 input.cohorts[0].windowDays=30;assert.equal(row(input).windowMature,false);input.asOf='2026-10-31';assert.equal(row(input).windowMature,true);
});
test('contacts/free-form fields, wrong proof kinds, malformed money and duplicate cohort/source IDs fail closed',()=>{
 const invalid=[input=>input.email='private@example.test',input=>input.cohorts[0].flows.hostingCost.micros=0,input=>input.cohorts[0].flows.hostingCost.evidence=['adproceeds'],input=>input.evidence.push({...input.evidence[0]}),input=>input.cohorts.push({...input.cohorts[0]}),input=>Object.assign(input.cohorts[0].flows.hostingCost,{coverage:'unknown',micros:null,evidence:['private@example.test']}),input=>Object.assign(input.cohorts[0],{countCoverage:'unknown',acquiredCount:null,countEvidence:['private@example.test']})];for(const change of invalid){const input=fixture();change(input);assert.throws(()=>row(input),/Invalid reviewed/);}
});
test('the actual CLI hashes private source files, removes their paths from output and rejects changed evidence',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'brick-contribution-')),inputPath=join(cwd,'input.json'),proofPath=join(cwd,'private-report.txt'),proof='Disposable fixture report. No real money.',sha256=createHash('sha256').update(proof).digest('hex'),script=new URL('../scripts/contribution-report.mjs',import.meta.url).pathname.replace(/^\/(\w:)/,'$1');
 const input=fixture();input.evidence=input.evidence.map(item=>({id:item.id,kind:item.kind,path:'private-report.txt',sha256}));
 try{await writeFile(proofPath,proof);await writeFile(inputPath,JSON.stringify(input));const result=await promisify(execFile)(process.execPath,[script,'--input',inputPath],{cwd}),output=JSON.parse(result.stdout);assert.equal(output.cohorts[0].windowContributionMicros,'25000000');assert(output.evidence.every(e=>e.sha256===sha256&&e.bytes===Buffer.byteLength(proof)));assert(!result.stdout.includes(cwd));assert(!result.stdout.includes('private-report.txt'));assert(!result.stdout.includes(proof));
  await writeFile(proofPath,proof+' changed');await assert.rejects(()=>promisify(execFile)(process.execPath,[script,'--input',inputPath],{cwd}),error=>{assert.equal(error.code,1);assert.match(error.stderr,/evidence changed/);assert.equal(error.stdout,'');return true;});
 }finally{await unlink(inputPath);await unlink(proofPath);await rmdir(cwd);}
});
