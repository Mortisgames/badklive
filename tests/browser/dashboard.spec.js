import { test, expect } from '@playwright/test';
import { fixtureTexts } from '../helpers.js';
import { GIDS } from '../../js/config.js';

async function sources(context, texts=fixtureTexts()) {
  await context.route('https://docs.google.com/**',route=>{
    const gid=Number(new URL(route.request().url()).searchParams.get('gid'));
    const key=Object.keys(GIDS).find(k=>GIDS[k]===gid);
    return route.fulfill({status:200,contentType:'text/csv',body:texts[key]});
  });
  await context.route('https://r.jina.ai/**',route=>route.fulfill({status:503,body:'Unavailable test proxy'}));
  await context.route('https://fonts.**/**',route=>route.abort());
}
async function loaded(page,url='/') {
  await page.goto(url);
  await expect(page.locator('#stTxt')).toContainText('Отримано');
  await page.locator('#bootSkip').click();
  await expect(page.locator('#boot')).toHaveCount(0);
}

test('desktop tabs render without runtime errors and failed update preserves the view',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await sources(context);await loaded(page);
  for(const view of ['city','cal','reg','waves','model','feed','night']){
    await page.locator(`nav button[data-v="${view}"]`).click();
    await expect(page.locator(`#v-${view}`)).toBeVisible();
  }
  const before=await page.locator('#hero').innerHTML();
  await context.route('https://docs.google.com/**',route=>route.fulfill({status:503,body:'Down'}));
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#stTxt')).toContainText('Оновлення не вдалося');
  expect(await page.locator('#hero').innerHTML()).toBe(before);
  await expect(page.locator('#btnRefresh')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('mobile and empty sections render without NaN or exceptions',async({page,context})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const texts=fixtureTexts();
  for(const key of ['cal','reg','tactics','waves']) texts[key]=texts[key].split('\r\n')[0];
  await sources(context,texts);await loaded(page);
  for(const view of ['city','cal','reg','waves','model']){
    await page.locator(`nav button[data-v="${view}"]`).click();
    expect(await page.locator(`#v-${view}`).innerHTML()).not.toContain('NaN');
  }
  await page.locator('nav button[data-v="cal"]').click();
  await expect(page.locator('#calAll')).toContainText('Немає даних');
  await page.screenshot({path:'test-results/mobile-calendar.png',fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);
});

test('no cached data plus unavailable source shows a recoverable error',async({page,context})=>{
  await context.route('https://docs.google.com/**',route=>route.fulfill({status:503,body:'Down'}));
  await page.goto('/');
  await expect(page.locator('#stTxt')).toHaveText('Не вдалося завантажити дані');
  await expect(page.locator('#btnRefresh')).toBeEnabled();
  await sources(context);
  await page.locator('#bootSkip').click();
  await page.locator('#btnRefresh').click();
  await expect(page.locator('#stTxt')).toContainText('Отримано');
});

test('PWA caches every module and restores the snapshot offline, including legacy URL',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await sources(context);await loaded(page,'/?pwa');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  await context.unroute("https://docs.google.com/**");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#hero')).toContainText('Тестове місто');
  await expect(page.locator('#cacheNote')).toContainText('знімок');
  await page.goto('/badk-live-dashboard.html');
  await expect(page).toHaveURL(/index\.html/);
  await expect(page.locator('#hero')).toContainText('Тестове місто');
  expect(errors).toEqual([]);
});

test('legacy data cache is restored even when the first new-version refresh fails',async({page,context})=>{
  await page.addInitScript(texts=>localStorage.setItem('badklive_cache_v1',JSON.stringify({ts:Date.now()-60000,texts})),fixtureTexts());
  await context.route('https://docs.google.com/**',route=>route.fulfill({status:503,body:'Down'}));
  await page.goto('/');
  await expect(page.locator('#hero')).toContainText('Тестове місто');
  await expect(page.locator('#cacheNote')).toContainText('попередній знімок');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('badklive_cache_v2')).version)).toBe(2);
});

test('a new worker waits until the user accepts the update',async({page,context})=>{
  await sources(context);await loaded(page,'/?pwa');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  // A changed script URL exercises the browser's real update lifecycle, without mutating source files.
  await page.evaluate(()=>navigator.serviceWorker.register('/sw.js?next-release',{updateViaCache:'none'}));
  await expect(page.locator('#appUpdate')).toBeVisible();
  const reloaded=page.waitForEvent('load');
  await page.locator('#appUpdate').click();await reloaded;
  await expect(page.locator('#hero')).toContainText('Тестове місто');
});


test('empty dashboard and zero-valued waves remain renderable',async({page,context})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const texts=fixtureTexts();
  texts.dash=texts.dash.split('\r\n').slice(0,2).join('\r\n');
  texts.waves=texts.waves.replace(',50,',',0,');
  await sources(context,texts);await loaded(page);
  await expect(page.locator('#hero')).toContainText('Немає оцінок');
  await page.locator('nav button[data-v="city"]').click();
  await expect(page.locator('#cityBody')).toContainText('Немає даних міст');
  await page.locator('nav button[data-v="waves"]').click();
  expect(await page.locator('#wavesChart').innerHTML()).not.toMatch(/NaN|Infinity/);
  expect(errors).toEqual([]);
});
