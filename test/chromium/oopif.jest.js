/**
 * Copyright 2017 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const {FFOX, CHROMIUM, WEBKIT, CHANNEL} = testOptions;

registerFixture('sppBrowser', async ({browserType, defaultBrowserOptions}, test) => {
  const browser = await browserType.launch({
    ...defaultBrowserOptions,
    args: (defaultBrowserOptions.args || []).concat(['--site-per-process'])
  });
  try {
    await test(browser);
  } finally {
    await browser.close();
  }
});

registerFixture('sppContext', async ({sppBrowser}, test) => {
  const context = await sppBrowser.newContext();
  try {
    await test(context);
  } finally {
    await context.close();
  }
});

registerFixture('sppPage', async ({sppContext}, test) => {
  const page = await sppContext.newPage();
  await test(page);
});


describe.skip(!CHROMIUM)('OOPIF', function() {
  it('should report oopif frames', async function({sppBrowser, sppPage, server}) {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
    expect(page.frames().length).toBe(2);
    expect(await page.frames()[1].evaluate(() => '' + location.href)).toBe(server.CROSS_PROCESS_PREFIX + '/grid.html');
  });
  it('should handle oopif detach', async function({sppBrowser, sppPage, server}) {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
    expect(page.frames().length).toBe(2);
    const frame = page.frames()[1];
    expect(await frame.evaluate(() => '' + location.href)).toBe(server.CROSS_PROCESS_PREFIX + '/grid.html');
    const [detachedFrame] = await Promise.all([
      page.waitForEvent('framedetached'),
      page.evaluate(() => document.querySelector('iframe').remove()),
    ]);
    expect(detachedFrame).toBe(frame);
  });
  it('should handle remote -> local -> remote transitions', async function({sppBrowser, sppPage, server}) {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    expect(await page.frames()[1].evaluate(() => '' + location.href)).toBe(server.CROSS_PROCESS_PREFIX + '/grid.html');
    await Promise.all([
      page.frames()[1].waitForNavigation(),
      page.evaluate(() => goLocal()),
    ]);
    expect(await page.frames()[1].evaluate(() => '' + location.href)).toBe(server.PREFIX + '/grid.html');
    expect(await countOOPIFs(browser)).toBe(0);
    await Promise.all([
      page.frames()[1].waitForNavigation(),
      page.evaluate(() => goRemote()),
    ]);
    expect(await page.frames()[1].evaluate(() => '' + location.href)).toBe(server.CROSS_PROCESS_PREFIX + '/grid.html');
    expect(await countOOPIFs(browser)).toBe(1);
  });
  it.fail(true)('should get the proper viewport', async({sppBrowser, sppPage, server}) => {
    const browser = sppBrowser;
    const page = sppPage;
    expect(page.viewportSize()).toEqual({width: 1280, height: 720});
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    const oopif = page.frames()[1];
    expect(await oopif.evaluate(() => screen.width)).toBe(1280);
    expect(await oopif.evaluate(() => screen.height)).toBe(720);
    expect(await oopif.evaluate(() => matchMedia('(device-width: 1280px)').matches)).toBe(true);
    expect(await oopif.evaluate(() => matchMedia('(device-height: 720px)').matches)).toBe(true);
    expect(await oopif.evaluate(() => 'ontouchstart' in window)).toBe(false);
    await page.setViewportSize({width: 123, height: 456});
    expect(await oopif.evaluate(() => screen.width)).toBe(123);
    expect(await oopif.evaluate(() => screen.height)).toBe(456);
    expect(await oopif.evaluate(() => matchMedia('(device-width: 123px)').matches)).toBe(true);
    expect(await oopif.evaluate(() => matchMedia('(device-height: 456px)').matches)).toBe(true);
    expect(await oopif.evaluate(() => 'ontouchstart' in window)).toBe(false);
  });
  it('should expose function', async({sppBrowser, sppPage, server}) => {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    const oopif = page.frames()[1];
    await page.exposeFunction('mul', (a, b) => a * b);
    const result = await oopif.evaluate(async function() {
      return await mul(9, 4);
    });
    expect(result).toBe(36);
  });
  it('should emulate media', async({sppBrowser, sppPage, server}) => {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    const oopif = page.frames()[1];
    expect(await oopif.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(false);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect(await oopif.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  });
  it('should emulate offline', async({sppBrowser, sppPage, sppContext, server}) => {
    const browser = sppBrowser;
    const context = sppContext;
    const page = sppPage;
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    const oopif = page.frames()[1];
    expect(await oopif.evaluate(() => navigator.onLine)).toBe(true);
    await context.setOffline(true);
    expect(await oopif.evaluate(() => navigator.onLine)).toBe(false);
  });
  it('should support context options', async({sppBrowser, server, playwright}) => {
    const browser = sppBrowser;
    const iPhone = playwright.devices['iPhone 6']
    const context = await browser.newContext({ ...iPhone, timezoneId: 'America/Jamaica', locale: 'fr-CH', userAgent: 'UA' });
    const page = await context.newPage();

    const [request] = await Promise.all([
      server.waitForRequest('/grid.html'),
      page.goto(server.PREFIX + '/dynamic-oopif.html'),
    ]);
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    const oopif = page.frames()[1];

    expect(await oopif.evaluate(() => 'ontouchstart' in window)).toBe(true);
    expect(await oopif.evaluate(() => new Date(1479579154987).toString())).toBe('Sat Nov 19 2016 13:12:34 GMT-0500 (heure normale de l’Est nord-américain)');
    expect(await oopif.evaluate(() => navigator.language)).toBe('fr-CH');
    expect(await oopif.evaluate(() => navigator.userAgent)).toBe('UA');
    expect(request.headers['user-agent']).toBe('UA');

    await context.close();
  });
  it('should respect route', async({sppBrowser, sppPage, server}) => {
    const browser = sppBrowser;
    const page = sppPage;
    let intercepted = false;
    await page.route('**/digits/0.png', route => {
      intercepted = true;
      route.continue();
    });
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    expect(intercepted).toBe(true);
  });
  it('should take screenshot', async({sppBrowser, sppPage, server}) => {
    const browser = sppBrowser;
    const page = sppPage;
    await page.setViewportSize({width: 500, height: 500});
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(page.frames().length).toBe(2);
    expect(await countOOPIFs(browser)).toBe(1);
    expect(await page.screenshot()).toBeGolden('screenshot-oopif.png');
  });
  it('should load oopif iframes with subresources and request interception', async function({sppBrowser, sppPage, server, context}) {
    const browser = sppBrowser;
    const page = sppPage;
    await page.route('**/*', route => route.continue());
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
  });
  it('should report main requests', async function({sppBrowser, sppPage, server}) {
    const browser = sppBrowser;
    const page = sppPage;
    const requestFrames = [];
    page.on('request', r => requestFrames.push(r.frame()));
    const finishedFrames = [];
    page.on('requestfinished', r => finishedFrames.push(r.frame()));

    await page.goto(server.PREFIX + '/empty.html');
    const main = page.mainFrame();

    await main.evaluate(url => {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      document.body.appendChild(iframe);
      return new Promise(f => iframe.onload = f);
    }, server.CROSS_PROCESS_PREFIX + '/empty.html');
    expect(page.frames().length).toBe(2);
    const child = main.childFrames()[0];
    await child.waitForLoadState('domcontentloaded');

    await child.evaluate(url => {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      document.body.appendChild(iframe);
      return new Promise(f => iframe.onload = f);
    }, server.PREFIX + '/empty.html');
    expect(page.frames().length).toBe(3);
    const grandChild = child.childFrames()[0];
    await grandChild.waitForLoadState('domcontentloaded');

    expect(await countOOPIFs(browser)).toBe(2);
    expect(requestFrames[0]).toBe(main);
    expect(finishedFrames[0]).toBe(main);
    expect(requestFrames[1]).toBe(child);
    expect(finishedFrames[1]).toBe(child);
    expect(requestFrames[2]).toBe(grandChild);
    expect(finishedFrames[2]).toBe(grandChild);
  });
  it('should support exposeFunction', async function({sppBrowser, sppContext, sppPage, server}) {
    const browser = sppBrowser;
    const context = sppContext;
    const page = sppPage;
    await context.exposeFunction('dec', a => a - 1);
    await page.exposeFunction('inc', a => a + 1);
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
    expect(page.frames().length).toBe(2);
    expect(await page.frames()[0].evaluate(() => inc(3))).toBe(4);
    expect(await page.frames()[1].evaluate(() => inc(4))).toBe(5);
    expect(await page.frames()[0].evaluate(() => dec(3))).toBe(2);
    expect(await page.frames()[1].evaluate(() => dec(4))).toBe(3);
  });
  it('should support addInitScript', async function({sppBrowser, sppContext, sppPage, server}) {
    const browser = sppBrowser;
    const context = sppContext;
    const page = sppPage;
    await context.addInitScript(() => window.bar = 17);
    await page.addInitScript(() => window.foo = 42);
    await page.goto(server.PREFIX + '/dynamic-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
    expect(page.frames().length).toBe(2);
    expect(await page.frames()[0].evaluate(() => window.foo)).toBe(42);
    expect(await page.frames()[1].evaluate(() => window.foo)).toBe(42);
    expect(await page.frames()[0].evaluate(() => window.bar)).toBe(17);
    expect(await page.frames()[1].evaluate(() => window.bar)).toBe(17);
  });
  // @see https://github.com/microsoft/playwright/issues/1240
  it('should click a button when it overlays oopif', async function({sppBrowser, sppPage, server}) {
    const browser = sppBrowser;
    const page = sppPage;
    await page.goto(server.PREFIX + '/button-overlay-oopif.html');
    expect(await countOOPIFs(browser)).toBe(1);
    await page.click('button');
    expect(await page.evaluate(() => window.BUTTON_CLICKED)).toBe(true);
  });
  it('should report google.com frame with headful', async({browserType, defaultBrowserOptions, server}) => {
    // @see https://github.com/GoogleChrome/puppeteer/issues/2548
    // https://google.com is isolated by default in Chromium embedder.
    const browser = await browserType.launch({...defaultBrowserOptions, headless: false});
    const page = await browser.newPage();
    await page.goto(server.EMPTY_PAGE);
    await page.route('**/*', route => {
      route.fulfill({body: 'YO, GOOGLE.COM'});
    });
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.setAttribute('src', 'https://google.com/');
      document.body.appendChild(frame);
      return new Promise(x => frame.onload = x);
    });
    await page.waitForSelector('iframe[src="https://google.com/"]');
    expect(await countOOPIFs(browser)).toBe(1);
    const urls = page.frames().map(frame => frame.url());
    expect(urls).toEqual([
      server.EMPTY_PAGE,
      'https://google.com/'
    ]);
    await browser.close();
  });
});

async function countOOPIFs(browser) {
  const browserSession = await browser.newBrowserCDPSession();
  const oopifs = [];
  browserSession.on('Target.targetCreated', async ({targetInfo}) => {
    if (targetInfo.type === 'iframe')
       oopifs.push(targetInfo);
  });
  await browserSession.send('Target.setDiscoverTargets', { discover: true });
  await browserSession.detach();
  return oopifs.length;
}
