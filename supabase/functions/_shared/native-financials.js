// Financial observations never authorize a purchase. Only the independently
// verified receipt does. RevenueCat's USD values are provider estimates, not a
// storefront's localized checkout price or a finalized bank settlement.
const micros=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1000000000?Math.round(value*1000000):null;
export function nativeFinancials(purchase){
 const country=typeof purchase?.country==='string'&&/^[A-Z]{2}$/.test(purchase.country)?purchase.country:null;
 const result={quality:'missing',country,grossMicros:null,commissionMicros:null,taxMicros:null,proceedsMicros:null};
 const money=purchase?.revenue_in_usd;if(money===null||money===undefined)return result;
 if(!money||typeof money!=='object'||Array.isArray(money)||money.currency!=='USD')return{...result,quality:'invalid'};
 const values=['gross','commission','tax','proceeds'].map(key=>micros(money[key]));
 if(values.some(value=>value===null)||Math.abs(values[0]-values[1]-values[2]-values[3])>2)return{...result,quality:'invalid'};
 return{quality:'estimated',country,grossMicros:String(values[0]),commissionMicros:String(values[1]),taxMicros:String(values[2]),proceedsMicros:String(values[3])};
}
