// PDF.js 6 uses these newer collection methods. Keep older Android browsers usable.
export function installBrowserCompat(){
 for(const Type of [Map,WeakMap]){
  if(!Type.prototype.getOrInsertComputed)Object.defineProperty(Type.prototype,'getOrInsertComputed',{configurable:true,writable:true,value:function(key,callback){if(typeof callback!=='function')throw new TypeError('callback must be callable');if(this.has(key))return this.get(key);const value=callback(key);this.set(key,value);return value;}});
  if(!Type.prototype.getOrInsert)Object.defineProperty(Type.prototype,'getOrInsert',{configurable:true,writable:true,value:function(key,value){if(this.has(key))return this.get(key);this.set(key,value);return value;}});
 }
}
