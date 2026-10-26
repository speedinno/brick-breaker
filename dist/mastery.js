// Inclusive integer intervals keep old mastery stamps when recent timing/history
// rows are pruned. These personal stamps never authorize a currency grant.
const level = n => Number.isSafeInteger(n) && n > 0 && n < Number.MAX_SAFE_INTEGER;
export function mergeRanges(...lists) {
  const sorted = lists.flatMap(list => Array.isArray(list) ? list.filter(r => Array.isArray(r) && r.length === 2 && level(r[0]) && level(r[1]) && r[0] <= r[1]).map(r => [r[0], r[1]]) : []).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const range of sorted) {
    const prior = out.at(-1);
    if (prior && range[0] <= prior[1] + 1) prior[1] = Math.max(prior[1], range[1]);
    else out.push(range);
  }
  return out;
}
export function intersectRanges(left, right) {
  const a = mergeRanges(left), b = mergeRanges(right), out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return mergeRanges(out);
}
export function differenceRanges(left,right){
  const a=mergeRanges(left),b=mergeRanges(right),out=[];let j=0;
  for(const [first,last]of a){
    let cursor=first;while(j<b.length&&b[j][1]<cursor)j++;
    let k=j;
    while(k<b.length&&b[k][0]<=last){
      if(b[k][0]>cursor)out.push([cursor,b[k][0]-1]);
      cursor=Math.max(cursor,b[k][1]+1);if(cursor>last)break;k++;
    }
    if(cursor<=last)out.push([cursor,last]);j=k;
  }
  return out;
}
export function normalizeMastery(value, progress) {
  const allowed = progress.starters.map(n => [n, n]);
  if (progress.starters.length === 12 && progress.journeyNext > 13) allowed.push([13, progress.journeyNext - 1]);
  const manual = intersectRanges(value?.manual, allowed);
  return {manual, clean: intersectRanges(value?.clean, manual)};
}
export function mergeMastery(a, b) { return {manual: mergeRanges(a?.manual, b?.manual), clean: mergeRanges(a?.clean, b?.clean)}; }
export function stampMastery(mastery, n, clean = false) {
  return {manual: mergeRanges(mastery.manual, [[n, n]]), clean: clean ? mergeRanges(mastery.clean, [[n, n]]) : mergeRanges(mastery.clean)};
}
export function isMastered(progress, n, kind = 'manual') {
  const ranges = progress.mastery?.[kind] || [];
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2), [first, last] = ranges[mid];
    if (n < first) hi = mid - 1; else if (n > last) lo = mid + 1; else return true;
  }
  return false;
}
export function masteryCount(progress, kind = 'manual') { return (progress.mastery?.[kind] || []).reduce((n, [first, last]) => n + last - first + 1, 0); }
export function masteryLabel(progress, n) { return isMastered(progress, n, 'clean') ? '✦ Clean manual clear' : isMastered(progress, n) ? '★ Manual clear' : ''; }
