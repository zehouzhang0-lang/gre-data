import { chromium } from '@playwright/test';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const out = path.join(root, 'QA.json');
const shots = path.join(root, 'screenshots');
const focused = process.argv.includes('--search-origin');
const results = {
  startedAt: new Date().toISOString(),
  target: 'http://127.0.0.1:4188/',
  isolation: 'New headless Chrome browser and fresh Playwright contexts; no real browser or personal storage accessed.',
  fallback: 'Parent attempted built-in browser; Browser is not available. Using Playwright Chrome.',
  environment: { platform: process.platform, node: process.version, build: 'Vite development', data: '168 synthetic words, no personal library', cpuThrottle: 'none' },
  checks: [], screenshots: [], performance: {}, errors: [], limitations: [
    'Desktop Chrome CDP touch emulation is not physical Android WebView or finger ergonomics verification.',
    'commitMs measures prototype handler to React layout effect; paintProxyMs is a double-requestAnimationFrame proxy, not actual display presentation.',
    'No comparable production baseline; these results cannot support a production speedup claim.',
    'IME composition, TalkBack, physical keyboard occlusion, safe area and Android lifecycle remain device checks.',
  ],
};
if (focused) {
  Object.assign(results, JSON.parse(await readFile(out, 'utf8')));
  results.focusedFollowup = { startedAt: new Date().toISOString(), reason: 'Search-origin restore fix; only this regression is rerun. Previous performance samples retained and not remeasured.' };
}
await mkdir(shots, { recursive: true });
const flush = () => writeFile(out, JSON.stringify(results, null, 2));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const check = async (name, fn) => {
  const start = performance.now();
  try { const evidence = await fn(); results.checks.push({name, status:'pass', elapsedMs: Math.round(performance.now()-start), evidence}); console.log(`PASS ${name}`); }
  catch(error) { results.checks.push({name,status:'fail',elapsedMs:Math.round(performance.now()-start),error:error.message}); console.log(`FAIL ${name}: ${error.message}`); }
  await flush();
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
results.environment.browser = browser.version();
const context = await browser.newContext({ viewport: {width:1440,height:1050}, hasTouch:true, deviceScaleFactor:1 });
const page = await context.newPage();
page.setDefaultTimeout(5000);
page.setDefaultNavigationTimeout(30000);
page.on('pageerror', e => results.errors.push({type:'pageerror',message:e.message}));
const responseFailures = [], followupErrors = [];
page.on('response', r => { if(r.status()>=400) responseFailures.push({status:r.status(),url:r.url()}); });
page.on('console', m => { if (m.type()==='error') { const error={type:'console',message:m.text(),location:m.location()}; results.errors.push(error); followupErrors.push(error); } });
const settle = async () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snap = async () => page.evaluate(() => window.prototypeQA.snapshot());
const reset = async () => { await page.getByRole('button',{name:'重置演示',exact:true}).click(); await settle(); };
const nav = name => page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name,exact:true});
const next = () => page.getByRole('button',{name:'下一页',exact:true});
const previous = () => page.getByRole('button',{name:'上一页',exact:true});
const search = () => page.getByRole('searchbox');
const closeToast = async () => { const b=page.getByRole('button',{name:'关闭提示',exact:true}); if(await b.count()) await b.click(); };
const theme = async name => { await page.getByRole('button',{name:name==='clear'?'A · 清爽白底 熟悉的青绿，更清楚的层级':'B · 纸感阅读 柔和纸色，更安静的英文阅读'}).click(); await settle(); };
const screenshot = async name => {
  const filename=`${name}.png`; await page.locator('.phone').screenshot({path:path.join(shots,filename)});
  results.screenshots.push({name,path:`screenshots/${filename}`}); await flush();
};
const cdp = await context.newCDPSession(page);
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function touchStroke(startPoints,endPoints,hold=0) {
  const format = points => points.map((p,i)=>({x:p.x,y:p.y,id:i+1,radiusX:4,radiusY:4,force:1}));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:format(startPoints)});
  if(hold) await delay(hold);
  if(endPoints) for(let step=1;step<=10;step++) {
    const points=startPoints.map((p,i)=>({x:p.x+(endPoints[i].x-p.x)*step/10,y:p.y+(endPoints[i].y-p.y)*step/10}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:format(points)});
    await delay(16);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await settle();
}

try {
  await page.goto(results.target,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.prototypeQA);
  if (focused) {
    await check('Fresh page three then search edits restore original filter/sort/page/IDs, with and without reload',async()=>{
      const evidence=[];
      for(const reload of [false,true]) {
        await reset(); await next().click(); await next().click(); await page.getByRole('button',{name:'fresh 本页',exact:true}).click(); await settle(); const before=await snap();
        await search().fill('a'); await page.getByLabel('筛选词库').selectOption('clear'); await page.getByLabel('排序',{exact:true}).selectOption('az'); await settle();
        const searching=await snap(); assert(searching.filter==='clear'&&searching.sort==='az','search filter/sort controls not applied');
        if(reload) { await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>!!window.prototypeQA); }
        await page.getByRole('button',{name:'清空搜索',exact:true}).click(); await settle(); const after=await snap();
        assert(after.filter===before.filter&&after.sort===before.sort&&after.index===before.index&&same(after.ids,before.ids)&&same(after.pages,before.pages),`clearing did not restore original filter/sort/page/IDs, reload=${reload}`);
        evidence.push({reload,before:{filter:before.filter,sort:before.sort,page:before.index+1,ids:before.ids},searching:{filter:searching.filter,sort:searching.sort},after:{filter:after.filter,sort:after.sort,page:after.index+1,ids:after.ids}});
      }
      return evidence;
    });
    for(const direction of ['clear','paper']) {
      await reset(); await theme(direction); await screenshot(`${direction}-wall-latest`); await nav('复习').click(); await screenshot(`${direction}-review-latest`);
    }
    await check('favicon resource loads without HTTP or console errors after fix',async()=>{
      assert(responseFailures.length===0&&followupErrors.length===0,JSON.stringify({responseFailures,followupErrors})); return {httpErrors:responseFailures,consoleErrors:followupErrors};
    });
    results.focusedFollowup.performanceNote='Existing 20-sample measurements predate the searchOrigin edge-case fix; not remeasured.';
    results.focusedFollowup.resourceFailures=responseFailures;
    await reset();
  } else {
  await screenshot('clear-wall-initial');
  await check('initial 28 of 168, four columns and seven rows',async()=>{
    const s=await snap(); const geometry=await page.locator('.word-grid').evaluate(el=>({columns:getComputedStyle(el).gridTemplateColumns.split(' ').length,rows:getComputedStyle(el).gridTemplateRows.split(' ').length,count:el.children.length}));
    assert(s.ids.length===28 && s.total===168 && s.pages.length===6,JSON.stringify(s));
    assert(geometry.columns===4&&geometry.rows===7&&geometry.count===28,JSON.stringify(geometry));
    return {total:s.total,pages:s.pages.length,geometry};
  });
  await check('search clear returns page three with same IDs',async()=>{
    await reset(); await next().click(); await next().click(); await settle(); const before=await snap();
    await search().fill('a'); await settle(); assert((await snap()).query==='a','query not applied');
    await page.getByRole('button',{name:'清空搜索',exact:true}).click(); await settle(); const after=await snap();
    assert(before.index===2&&after.index===2&&same(before.ids,after.ids),'search did not restore page 3/IDs');
    return {page:after.index+1,ids:after.ids};
  });
  await check('filter, sort and page survive search clear',async()=>{
    await reset(); await page.getByLabel('筛选词库').selectOption('clear'); await page.getByLabel('排序',{exact:true}).selectOption('az');
    await next().click(); await settle(); const before=await snap(); await search().fill('e'); await settle();
    await page.getByRole('button',{name:'清空搜索',exact:true}).click(); await settle(); const after=await snap();
    assert(after.filter==='clear'&&after.sort==='az'&&after.index===before.index&&same(after.ids,before.ids),'filter/sort/page changed');
    return {filter:after.filter,sort:after.sort,page:after.index+1};
  });
  await check('Fresh moves exact batch three pages, no duplicate or loss, undo restores',async()=>{
    await reset(); const before=await snap(); await page.getByRole('button',{name:'fresh 本页',exact:true}).click(); await settle(); const after=await snap();
    assert(after.index===0&&same(after.ids,before.pages[1])&&same(after.pages[3],before.ids),'Fresh destination/content incorrect');
    assert(same(after.pages.flat().sort(),before.pages.flat().sort())&&new Set(after.pages.flat()).size===168,'duplicate or missing IDs');
    await page.getByRole('button',{name:'撤销',exact:true}).click(); await settle(); const undone=await snap();
    assert(same(undone.pages,before.pages)&&undone.index===before.index,'undo did not restore');
    return {movedBatch:before.ids,destinationPage:4,total:after.total};
  });
  await check('Fresh disabled on last page',async()=>{
    await reset(); for(let i=0;i<5;i++) await next().click();
    assert(await page.getByRole('button',{name:'fresh 本页',exact:true}).isDisabled(),'Fresh enabled on last page');
    assert(await next().isDisabled(),'next enabled on last page'); return {page:(await snap()).index+1};
  });
  await check('click flips; mouse long press selects without flipping',async()=>{
    await reset(); const tile=page.locator('[data-word-id]').first(); const id=await tile.getAttribute('data-word-id');
    await tile.click(); assert((await snap()).flips.includes(id),'click did not flip'); await tile.click();
    const box=await tile.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await delay(510); await page.mouse.up(); await settle();
    const s=await snap(); assert(s.selected.includes(id)&&s.flips.length===0,'long press wrong selected/flip state');
    return {selected:s.selected,flips:s.flips};
  });
  await check('CDP touch long press selects without ghost click',async()=>{
    await reset(); const tile=page.locator('[data-word-id]').first(); const id=await tile.getAttribute('data-word-id'); const box=await tile.boundingBox();
    await touchStroke([{x:box.x+box.width/2,y:box.y+box.height/2}],null,510);
    const s=await snap(); assert(s.selected.includes(id)&&s.flips.length===0,'touch hold wrong selected/flip state'); return {selected:s.selected,flips:s.flips};
  });
  await check('CDP one-finger left/right pages without flip or selection',async()=>{
    await reset(); const initial=await snap(); let b=await page.locator('.word-grid').boundingBox();
    await touchStroke([{x:b.x+b.width-35,y:b.y+125}],[{x:b.x+35,y:b.y+128}]); const left=await snap();
    assert(left.index===1&&left.flips.length===0&&left.selected.length===0,'left swipe wrong state');
    b=await page.locator('.word-grid').boundingBox(); await touchStroke([{x:b.x+35,y:b.y+125}],[{x:b.x+b.width-35,y:b.y+128}]); const right=await snap();
    assert(right.index===0&&same(right.ids,initial.ids)&&right.flips.length===0&&right.selected.length===0,'right swipe wrong state');
    return {leftPage:left.index+1,rightPage:right.index+1};
  });
  await check('CDP two-finger upward Fresh fires once without flip or selection',async()=>{
    await reset(); const before=await snap(); const b=await page.locator('.word-grid').boundingBox();
    await touchStroke([{x:b.x+90,y:b.y+245},{x:b.x+200,y:b.y+245}],[{x:b.x+92,y:b.y+145},{x:b.x+202,y:b.y+145}]);
    const after=await snap(); assert(after.index===0&&same(after.ids,before.pages[1])&&same(after.pages[3],before.ids),'two-finger Fresh missing or repeated');
    assert(after.flips.length===0&&after.selected.length===0,'two-finger caused flip/selection'); return {page:after.index+1,selected:after.selected,flips:after.flips};
  });
  await check('reduced motion preference suppresses grid animation',async()=>{
    await reset(); await page.emulateMedia({reducedMotion:'reduce'}); await next().click();
    const animations=await page.locator('.word-grid').evaluate(el=>el.getAnimations().length); assert(animations===0,'grid animation active under reduced motion');
    assert((await snap()).index===1,'page did not update with reduced motion'); await page.emulateMedia({reducedMotion:'no-preference'});
    await page.getByLabel('减少动态效果',{exact:true}).check(); await previous().click();
    assert(await page.locator('.word-grid').evaluate(el=>el.getAnimations().length)===0,'manual reduced motion failed'); return {systemAnimations:animations,manualAnimations:0};
  });
  await check('review 7 to 8 persists across tab switch and reload',async()=>{
    await reset(); await nav('复习').click(); await page.locator('.round-card').first().click(); assert((await snap()).reviews[0]===7,'initial review not 7');
    await page.getByRole('button',{name:'记得，继续',exact:true}).click(); await settle(); assert((await snap()).reviews[0]===8,'review not incremented');
    await nav('词库').click(); await nav('复习').click(); await page.locator('.round-card').first().click(); assert((await snap()).reviews[0]===8,'tab lost review');
    await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>!!window.prototypeQA); await page.locator('.round-card').first().click();
    assert((await snap()).reviews[0]===8,'reload lost review'); return {progress:(await snap()).reviews[0],saved:(await snap()).saved,sessionText:await page.locator('.session-heading p').innerText()};
  });
  await check('practice draft remains when navigating away and back',async()=>{
    await reset(); await nav('刷题').click(); await page.locator('.options button').nth(1).click();
    await page.getByRole('button',{name:'下一题',exact:true}).click(); await page.getByRole('button',{name:'上一题',exact:true}).click();
    assert(await page.locator('.options button').nth(1).getAttribute('aria-pressed')==='true','practice draft lost');
    return {selected:await page.locator('.options button[aria-pressed=true]').innerText(),savedText:await page.locator('.save-state').innerText()};
  });
  for(const width of [360,390]) await check(`${width}px mobile no horizontal overflow and 4x7`,async()=>{
    const ctx=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,hasTouch:true,isMobile:true}); const p=await ctx.newPage();
    try{await p.goto(results.target,{waitUntil:'networkidle'}); await p.waitForFunction(()=>!!window.prototypeQA);
      const layout=await p.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,phone:document.querySelector('.phone').getBoundingClientRect().width,main:document.querySelector('.phone-main').clientWidth,mainScroll:document.querySelector('.phone-main').scrollWidth,columns:getComputedStyle(document.querySelector('.word-grid')).gridTemplateColumns.split(' ').length,rows:getComputedStyle(document.querySelector('.word-grid')).gridTemplateRows.split(' ').length}));
      assert(layout.document<=width&&layout.mainScroll<=layout.main&&layout.columns===4&&layout.rows===7,JSON.stringify(layout));
      const filename=`mobile-${width}-wall.png`; await p.screenshot({path:path.join(shots,filename)}); results.screenshots.push({name:`mobile-${width}-wall`,path:`screenshots/${filename}`}); return layout;
    }finally{await ctx.close();}
  });
  for(const direction of ['clear','paper']) {
    await check(`${direction} screenshots wall/search/review`,async()=>{
      await reset(); await theme(direction); await screenshot(`${direction}-wall`); await search().fill('a'); await settle(); await screenshot(`${direction}-search`);
      await page.getByRole('button',{name:'清空搜索',exact:true}).click(); await nav('复习').click(); await screenshot(`${direction}-review`); return {theme:direction};
    });
  }
  const summarize = samples => {
    const calc=key=>{const v=samples.map(s=>s[key]).sort((a,b)=>a-b); return {medianMs:Number(((v[(v.length-1)>>1]+v[v.length>>1])/2).toFixed(2)),p95Ms:Number(v[Math.ceil(v.length*.95)-1].toFixed(2)),minMs:Number(v[0].toFixed(2)),maxMs:Number(v.at(-1).toFixed(2))};};
    return {n:samples.length,commit:calc('commitMs'),paintProxy:calc('paintProxyMs')};
  };
  for(const direction of ['clear','paper']) await check(`${direction} twenty samples per search/clear/next/previous/Fresh/undo`,async()=>{
    await reset(); await theme(direction); await page.evaluate(()=>window.prototypeQA.clearMetrics());
    for(let i=0;i<20;i++) {
      await search().fill(i%2?'e':'a'); await settle(); await page.getByRole('button',{name:'清空搜索',exact:true}).click(); await settle();
      await next().click(); await settle(); await previous().click(); await settle();
      await page.getByRole('button',{name:'fresh 本页',exact:true}).click(); await settle(); await page.getByRole('button',{name:'撤销',exact:true}).click(); await settle(); await closeToast();
    }
    const raw=await page.evaluate(()=>window.prototypeQA.metrics()); const grouped={};
    for(const action of ['search','clear','next','previous','fresh','undo']) {const samples=raw.filter(s=>s.action===action); assert(samples.length===20,`${action}: ${samples.length} not 20`); grouped[action]=summarize(samples);}
    results.performance[direction]={environment:'warm Vite development, 1440x1050 desktop Chrome viewport, 390px phone canvas, 168 synthetic words; no throttle',samples:raw,summary:grouped}; return grouped;
  });
  await reset();
  }
} catch(error) { results.fatal={message:error.message,stack:error.stack}; console.log(`FATAL ${error.message}`); }
finally { results.completedAt=new Date().toISOString(); results.summary={passed:results.checks.filter(x=>x.status==='pass').length,failed:results.checks.filter(x=>x.status==='fail').length}; await flush(); await browser.close(); }
console.log(JSON.stringify({out,summary:results.summary,errors:results.errors,fatal:results.fatal}));
