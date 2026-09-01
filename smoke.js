// cpk-jmp-studio 冒烟测试：功能回归 + 深色模式专项（canvas 取色联动 + tooltip + toast）
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push('[console] ' + msg.text()); });
  page.on('pageerror', err => errors.push('[pageerror] ' + err.message));

  await page.goto('http://127.0.0.1:8004/cpk_calculator.html', { waitUntil: 'networkidle' });
  console.log('1. 页面加载 OK');

  // 填入示例并计算
  await page.click('#btnSample');
  await page.waitForFunction(() => document.getElementById('parseInfo').textContent.includes('已解析'), null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const rows = document.querySelectorAll('#overallCap tbody tr');
    return rows.length > 0 && rows[0].textContent.includes('Ppk');
  }, null, { timeout: 30000 });
  console.log('2. 示例计算完成:', (await page.textContent('#parseInfo')).trim());
  await page.screenshot({ path: 'shot_main_light.png', fullPage: false });

  // 版本号
  const ver = await page.evaluate(() => document.querySelector('.ver').textContent);
  const footer = await page.textContent('footer');
  console.log('3. 版本徽标:', ver, '| footer 含 v2.10.0:', footer.includes('v2.10.0'));
  if (!ver.includes('v2.10.0') || !footer.includes('v2.10.0')) throw new Error('版本号不同步');

  // 指标卡/结果区
  const metricVisible = await page.evaluate(() => !!document.querySelector('.metric .v'));
  console.log('4. 指标卡渲染:', metricVisible);

  // canvas 直方图非空（浅色）
  const histPxLight = await page.evaluate(() => {
    const c = document.getElementById('cvHist');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  console.log('5. 直方图有绘制像素(浅色):', histPxLight > 1000 ? 'OK(' + histPxLight + ')' : 'FAIL(' + histPxLight + ')');

  // 术语百科
  await page.click('#btnGloss');
  await page.waitForTimeout(400);
  const glossCount = await page.textContent('#glossCount');
  console.log('6. 术语百科:', glossCount);
  await page.screenshot({ path: 'shot_gloss_light.png' });
  await page.click('#glossClose');

  // 更新记录
  await page.click('#btnChangelog');
  await page.waitForTimeout(400);
  const clog = await page.textContent('#clogList');
  console.log('7. 更新记录:', clog.includes('v2.10.0') ? '含 v2.10.0' : 'FAIL 无 v2.10.0');
  await page.screenshot({ path: 'shot_clog_light.png' });
  await page.click('#clogClose');

  // 深色模式：点 themeBtn → data-theme=dark + canvas 重绘取深色变量
  await page.click('#themeBtn');
  await page.waitForTimeout(800);
  const darkAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const themeBtnTxt = await page.textContent('#themeBtn');
  console.log('8. 深色切换: data-theme=' + darkAttr + ', 按钮=' + themeBtnTxt.trim());
  if (darkAttr !== 'dark') throw new Error('深色未生效');

  // canvas 取色断言：全画布扫描是否存在深色数据蓝 #4d8fd6（直方图柱体）与浅色文字 #cbd5e1
  const darkColors = await page.evaluate(() => {
    const c = document.getElementById('cvHist');
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const found = { dataBlue: 0, lightText: 0 };
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.abs(r - 77) < 28 && Math.abs(g - 143) < 28 && Math.abs(b - 214) < 28) found.dataBlue++;       // #4d8fd6
      if (Math.abs(r - 203) < 20 && Math.abs(g - 213) < 20 && Math.abs(b - 225) < 20) found.lightText++;     // #cbd5e1
    }
    return found;
  });
  console.log('9. 深色取色: 数据蓝#4d8fd6像素=' + darkColors.dataBlue + ', 文字#cbd5e1像素=' + darkColors.lightText);
  const hasDarkBlue = darkColors.dataBlue > 500 && darkColors.lightText > 500;
  console.log('   深色柱体/文字联动:', hasDarkBlue ? 'OK' : 'FAIL');
  if (!hasDarkBlue) throw new Error('深色 canvas 未联动取色');
  await page.screenshot({ path: 'shot_main_dark.png', fullPage: false });

  // 深色下术语百科弹窗背景（modal-bg #1e293b）
  await page.click('#btnGloss');
  await page.waitForTimeout(400);
  const glossBgDark = await page.evaluate(() => getComputedStyle(document.querySelector('.gloss-box')).backgroundColor);
  console.log('10. 深色弹窗背景:', glossBgDark, glossBgDark === 'rgb(30, 41, 59)' ? 'OK(#1e293b)' : 'FAIL');
  await page.screenshot({ path: 'shot_gloss_dark.png' });
  await page.click('#glossClose');

  // 控制图 hover tooltip（P2-3）
  await page.evaluate(() => document.getElementById('cvCtrlMain').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const tipText = await page.evaluate(() => {
    const cv = document.getElementById('cvCtrlMain');
    const rect = cv.getBoundingClientRect();
    return new Promise(res => {
      const handler = ev => {
        const tip = document.getElementById('chartTip');
        const txt = tip ? tip.textContent : '';
        cv.removeEventListener('mousemove', handler);
        res(txt);
      };
      cv.addEventListener('mousemove', handler);
      // 触发一次真实 mousemove（点画布中部）
      cv.dispatchEvent(new MouseEvent('mousemove', {
        clientX: rect.left + rect.width * 0.5,
        clientY: rect.top + rect.height * 0.5,
        bubbles: true
      }));
      setTimeout(() => { cv.removeEventListener('mousemove', handler); res('(timeout)'); }, 500);
    });
  });
  console.log('11. 控制图 tooltip:', tipText.includes('点') ? 'OK: ' + tipText.trim().slice(0, 60) : 'FAIL: ' + tipText.trim().slice(0, 60));
  if (!tipText.includes('点')) throw new Error('tooltip 未显示');

  // toast：复制 Markdown 触发
  await page.click('#btnMd');
  await page.waitForTimeout(300);
  const toastShown = await page.evaluate(() => {
    const t = document.getElementById('toast');
    return t.classList.contains('show') && t.textContent.length > 0;
  });
  console.log('12. toast 提示:', toastShown ? 'OK: ' + (await page.textContent('#toast')).trim() : 'FAIL');
  await page.waitForTimeout(2400);

  // 切回浅色（还原 localStorage 状态，避免污染后续测试）
  await page.click('#themeBtn');
  await page.waitForTimeout(400);
  console.log('13. 切回浅色: data-theme=' + await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light'));

  // 导出 PNG 大图背景跟随主题：monkey-patch toBlob 捕获大画布（不挂 DOM），断言首像素 = --canvas-bg
  await page.click('#themeBtn');
  await page.waitForTimeout(500);
  const pngBgDark = await page.evaluate(() => {
    let captured = null;
    const orig = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type) {
      if (!captured && this.width > 700) captured = this;   // 报告大画布宽 760
      return orig.call(this, cb, type);
    };
    document.getElementById('btnPng').click();
    HTMLCanvasElement.prototype.toBlob = orig;
    if (!captured) return null;
    const d = captured.getContext('2d').getImageData(0, 0, 8, 8).data;
    return d[0] + ',' + d[1] + ',' + d[2];
  });
  console.log('14. 导出大图背景(深色):', pngBgDark, pngBgDark === '17,26,42' ? 'OK(#111a2a)' : (pngBgDark ? 'FAIL' : '(未捕获到大画布)'));
  await page.click('#themeBtn');
  await page.waitForTimeout(400);
  console.log('15. 已切回浅色:', await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light'));

  console.log('--- 控制台错误数:', errors.length);
  errors.forEach(e => console.log('  ', e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
