// Android WebView localStorage can acknowledge a write before its disk flush.
// The native bridge commits game saves before the pause handler returns.
export function durableStorage(web, bridge) {
  if(!bridge)return web;
  const valid=key=>typeof key==='string'&&key.startsWith('brick-breaker-');
  let snapshot=JSON.parse(bridge.snapshot());
  if(!snapshot.initialized){
    const seed={};
    for(let i=0;i<web.length;i++){const key=web.key(i);if(valid(key))seed[key]=web.getItem(key);}
    if(!bridge.initialize(JSON.stringify(seed)))throw Error('Native save migration failed');
    snapshot=JSON.parse(bridge.snapshot());
  }
  const values=new Map(Object.entries(snapshot.values));
  // Replace stale WebView values, including removed accounts/sessions. Native
  // storage is authoritative after the one-time migration.
  const keys=Array.from({length:web.length},(_,i)=>web.key(i));
  for(const key of keys)if(valid(key)&&!values.has(key))try{web.removeItem(key);}catch{}
  for(const [key,value] of values)try{web.setItem(key,value);}catch{}
  return {
    getItem(key){return valid(key)?values.get(key)??null:web.getItem(key);},
    setItem(key,value){
      if(!valid(key))return web.setItem(key,value);
      value=String(value);
      if(!bridge.write(key,value))throw Error('Native save failed');
      values.set(key,value);try{web.setItem(key,value);}catch{}
    },
    removeItem(key){
      if(!valid(key))return web.removeItem(key);
      if(!bridge.remove(key))throw Error('Native save removal failed');
      values.delete(key);try{web.removeItem(key);}catch{}
    }
  };
}
