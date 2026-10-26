// Reviewed aggregate evidence, not a provider verifier or a player identity
// resolver. Integer micros and rational output avoid floating-point money.
export const components=['adProceeds','purchaseProceeds','acquisitionCost','hostingCost','supportCost','contentCost','additionalMerchantTax'];
const cost=name=>!['adProceeds','purchaseProceeds'].includes(name),validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const exact=(object,keys)=>object&&typeof object==='object'&&!Array.isArray(object)&&Object.keys(object).every(key=>keys.includes(key));
const id=value=>typeof value==='string'&&/^[a-z0-9_-]{1,80}$/.test(value),bad=()=>{throw Error('Invalid reviewed contribution input. No missing value is assumed zero.');};
export function contributionReport(input){
 if(!exact(input,['version','asOf','evidence','cohorts'])||input.version!==1||!validDate(input.asOf)||!Array.isArray(input.evidence)||input.evidence.length>100||!Array.isArray(input.cohorts)||input.cohorts.length>10000)bad();
 const proofs=new Map();for(const proof of input.evidence){if(!exact(proof,['id','kind','sha256','bytes'])||!id(proof.id)||proofs.has(proof.id)||!['publisher_report','purchase_report','acquisition_report','cost_record','reviewed_zero'].includes(proof.kind)||typeof proof.sha256!=='string'||!/^[a-f0-9]{64}$/.test(proof.sha256)||!Number.isSafeInteger(proof.bytes)||proof.bytes<1)bad();proofs.set(proof.id,proof);}
 const refs=(list,kinds)=>Array.isArray(list)&&list.length>0&&list.length<=10&&new Set(list).size===list.length&&list.every(key=>proofs.has(key)&&kinds.includes(proofs.get(key).kind));
 const ids=new Set(),rows=[];
 for(const row of input.cohorts){
  if(!exact(row,['id','day','windowDays','platform','reportedCountry','identityBasis','acquiredCount','countCoverage','countEvidence','attribution','reviewed','flows'])||!id(row.id)||ids.has(row.id)||!validDate(row.day)||![7,30].includes(row.windowDays)||!['android','ios','web','all_official'].includes(row.platform)||!(row.reportedCountry===null||typeof row.reportedCountry==='string'&&/^[A-Z]{2}$/.test(row.reportedCountry))||!['reviewed_unique_acquired_players','store_install_events','consenting_accounts'].includes(row.identityBasis)||!['complete','partial','unknown'].includes(row.countCoverage)||!(row.acquiredCount===null||Number.isSafeInteger(row.acquiredCount)&&row.acquiredCount>=0)||typeof row.reviewed!=='boolean'||!['cohort_measured','allocated_calendar_total'].includes(row.attribution)||!exact(row.flows,components))bad();ids.add(row.id);
  if(!Array.isArray(row.countEvidence)||row.countCoverage==='unknown'&&(row.acquiredCount!==null||row.countEvidence.length>0&&!refs(row.countEvidence,['acquisition_report']))||row.countCoverage!=='unknown'&&(row.acquiredCount===null||!refs(row.countEvidence,['acquisition_report'])))bad();
  const sums=new Map(),unknown=[],partial=[],estimates=[],normalized={};
  for(const name of components){const flow=row.flows[name];
   if(!exact(flow,['currency','micros','coverage','finality','evidence'])||typeof flow.currency!=='string'||!/^[A-Z]{3}$/.test(flow.currency)||!['complete','partial','unknown'].includes(flow.coverage)||!['final','estimate'].includes(flow.finality)||!(flow.micros===null||typeof flow.micros==='string'&&/^(0|-?[1-9]\d{0,23})$/.test(flow.micros)))bad();
   const kinds=[name==='adProceeds'?'publisher_report':name==='purchaseProceeds'?'purchase_report':'cost_record','reviewed_zero'];
   if(!Array.isArray(flow.evidence)||flow.coverage==='unknown'&&(flow.micros!==null||flow.evidence.length>0&&!refs(flow.evidence,kinds))||flow.coverage!=='unknown'&&(flow.micros===null||!refs(flow.evidence,kinds)))bad();
   if(flow.micros!=='0'&&flow.evidence.some(key=>proofs.get(key)?.kind==='reviewed_zero'))bad();
   normalized[name]={...flow};if(flow.coverage==='unknown'){unknown.push(name);continue;}if(cost(name)&&BigInt(flow.micros)<0n)bad();
   if(flow.coverage==='partial')partial.push(name);if(flow.finality==='estimate')estimates.push(name);sums.set(flow.currency,(sums.get(flow.currency)??0n)+(cost(name)?-1n:1n)*BigInt(flow.micros));
  }
  const endExclusive=new Date(Date.parse(row.day)+row.windowDays*86400000).toISOString().slice(0,10),mature=input.asOf>=endExclusive;
  const currencies=new Set(components.map(name=>row.flows[name].currency)),complete=unknown.length===0&&partial.length===0&&currencies.size===1&&mature&&row.reviewed;
  const observed=complete&&estimates.length===0&&row.attribution==='cohort_measured',currency=currencies.size===1?[...currencies][0]:null,total=complete?sums.get(currency).toString():null;
  const denominatorReady=row.countCoverage==='complete'&&row.acquiredCount>0;
  rows.push({id:row.id,cohortDay:row.day,windowDays:row.windowDays,endExclusive,windowMature:mature,platform:row.platform,reportedCountry:row.reportedCountry,identityBasis:row.identityBasis,attribution:row.attribution,
   status:!complete?'incomplete':observed?'reviewed_observation':'estimate',currency,
   windowContributionMicros:observed?total:null,estimatedWindowContributionMicros:complete&&!observed?total:null,
   netContributionPerNewPlayer:observed&&denominatorReady&&row.identityBasis==='reviewed_unique_acquired_players'?{numeratorMicros:total,denominatorPlayers:String(row.acquiredCount)}:null,
   estimateRatio:complete&&denominatorReady&&(!observed||row.identityBasis!=='reviewed_unique_acquired_players')?{numeratorMicros:total,denominatorCount:String(row.acquiredCount),denominatorBasis:row.identityBasis}:null,
   countCoverage:row.countCoverage,acquiredCount:row.acquiredCount,unknownComponents:unknown,partialComponents:partial,estimatedComponents:estimates,
   knownSubtotalByCurrency:[...sums].sort(([a],[b])=>a.localeCompare(b)).map(([currency,amount])=>({currency,contributionMicros:amount.toString()})),flows:normalized,countEvidence:row.countEvidence});
 }
 return{version:1,asOf:input.asOf,source:'operator_reviewed_aggregate_evidence',cohorts:rows,evidence:[...proofs.values()],overallProfit:null,limitations:[
  'Evidence hashes establish which local files were reviewed, not their truth or provider authenticity. Attribution and completeness need operator review.',
  'Ad proceeds must already be publisher net amounts. Purchase proceeds must already deduct provider/store fees, refunds and applicable adjustments; never deduct those shares twice.',
  'Additional merchant tax includes only incremental liabilities not already deducted from proceeds. Known zero requires explicit reviewed evidence.',
  'Calendar allocations and estimated proceeds are estimates. Store install events and consenting accounts are not unique newly acquired players.',
  'Currencies remain separate. Missing/partial components, immature windows or unreviewed inputs cannot produce complete contribution.',
  'Observed-window contribution is not projected lifetime value or overall profit. Fixed development/overhead investment still needs recovery.']};
}
