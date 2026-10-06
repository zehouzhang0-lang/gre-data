export default {join:(...parts)=>parts.join('/').replace(/\/+/g,'/'),resolve:(...parts)=>parts.join('/').replace(/\/+/g,'/')};
