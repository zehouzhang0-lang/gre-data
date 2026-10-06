// Browser-only, in-memory filesystem for the existing Store projection.
export const files=new Map(), attachments=new Map();
let clock=1;
export const normalize=p=>String(p).replace(/^\/+/,'').replace(/\/+/g,'/');
export function setFile(name,text){files.set(normalize(name),{text,stamp:++clock});}
export function initialize(input){for(const [name,text] of Object.entries(input))setFile(name,text);}
export function version(){return clock;}
function missing(p){return Object.assign(new Error(`找不到本地数据：${p}`),{code:'ENOENT'});}
const fs={
 async readFile(p){const v=files.get(normalize(p));if(!v)throw missing(p);return v.text;},
 async stat(p){const v=files.get(normalize(p));if(!v)throw missing(p);return {ino:0,size:v.text.length,mtimeMs:v.stamp,ctimeMs:v.stamp};},
 async readdir(p){const prefix=normalize(p).replace(/\/$/,'')+'/';return [...files.keys()].filter(k=>k.startsWith(prefix)&&!k.slice(prefix.length).includes('/')).map(k=>k.slice(prefix.length));},
 async access(p){if(!files.has(normalize(p))&&!attachments.has(normalize(p)))throw missing(p);},
 async mkdir(){},
 async writeFile(p,text,options){if(options?.flag==='wx'&&files.has(normalize(p)))throw Object.assign(Error('记录编号已存在'),{code:'EEXIST'});setFile(p,text);},
 async rename(from,to){const v=files.get(normalize(from));if(!v)throw missing(from);setFile(to,v.text);files.delete(normalize(from));}
};
export default fs;
