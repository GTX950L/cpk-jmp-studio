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

  // 版本号（动态断言：.ver 徽标须为 vX.Y.Z 且与 footer / 更新记录同步，不硬编码具体版本号，避免版本发布后回归假失败）
  const ver = await page.evaluate(() => document.querySelector('.ver').textContent);
  const footer = await page.textContent('footer');
  console.log('3. 版本徽标:', ver, '| footer 一致:', footer.includes(ver));
  if (!/^v\d+\.\d+\.\d+$/.test(ver) || !footer.includes(ver)) throw new Error('版本号不同步：徽标 ' + ver + ' 与 footer 不一致');

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
  console.log('7. 更新记录:', clog.includes(ver) ? '含当前版本 ' + ver : 'FAIL 无 ' + ver);
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

  // 生成器反馈（v2.16.0 修复回归）：点「生成并填入」后必须给出实测 Cpk（组内）/ Ppk（整体）
  await page.evaluate(() => {
    const d = document.getElementById('genBox'); if (d) d.open = true;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('genCpk', 1.33); set('genN', 60); set('genLsl', 9.95); set('genUsl', 10.05); set('genMu', 10);
  });
  await page.click('#btnGen');
  await page.waitForTimeout(700);
  const genMsg = (await page.textContent('#msg')).trim();
  console.log('16. 生成器反馈:', /实际 Cpk（组内）/.test(genMsg) && /Ppk（整体）/.test(genMsg) ? 'OK: ' + genMsg.slice(-72) : 'FAIL: ' + genMsg.slice(0, 60));
  if (!/实际 Cpk（组内）/.test(genMsg)) throw new Error('生成器未给出实测反馈（可能又触发了变量遮蔽类异常）');

  // 日期 + 数值两列粘贴（v2.16.0 修复回归）：年份不得被当测量值、不得触发子组 n=2 自动推断
  const dated = await page.evaluate(() => {
    document.getElementById('data').value = ['2026-09-01 10.01','2026-09-02 10.02','2026-09-03 9.99','2026-09-04 10.00','2026-09-05 10.03','2026-09-06 9.98'].join('\n');
    calc(false);
    const rows = [...document.querySelectorAll('#detail tbody tr')];
    const get = k => { const r = rows.find(t => t.children[0].textContent.trim() === k); return r ? r.children[1].textContent.trim() : null; };
    return { n: get('样本量 n'), mu: get('均值 μ'), sub: document.getElementById('sub').value, info: document.getElementById('parseInfo').textContent.trim() };
  });
  console.log('17. 日期+数值粘贴:', dated.n === '6' && dated.sub === '0' ? 'OK ' + JSON.stringify(dated) : 'FAIL ' + JSON.stringify(dated));
  if (dated.n !== '6' || dated.sub !== '0') throw new Error('日期列仍被当测量值 / 触发子组推断');

  // 版本一致性：徽标 = footer = 更新记录首条（v2.16.0 起把版本同步纳入冒烟）
  const verSync = await page.evaluate(() => {
    const badge = document.querySelector('.ver').textContent.trim();
    const clog = document.getElementById('clogList') ? document.getElementById('clogList').textContent : '';
    return { badge, footer: document.querySelector('footer').textContent.includes(badge), clog: clog.includes(badge) };
  });
  console.log('18. 版本同步:', verSync.footer && verSync.clog ? 'OK ' + JSON.stringify(verSync) : 'FAIL ' + JSON.stringify(verSync));
  if (!verSync.footer || !verSync.clog) throw new Error('版本号不同步：' + verSync.badge);

  // 数据已排序的防呆（v2.17.0 修复回归）：排序数据必须给出「疑似已排序」+「组内 σ 远小于整体 σ」提示
  const sortedCase = await page.evaluate(() => {
    let s = 777;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const g = () => { let u = 0, v = 0; while (u === 0)u = rnd(); while (v === 0)v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const a = []; for (let i = 0; i < 2000; i++)a.push(+(10 + 0.015 * g()).toFixed(5));
    document.getElementById('data').value = [...a].sort((x, y) => x - y).join('\n');
    document.getElementById('lsl').value = '9.9'; document.getElementById('usl').value = '10.1';
    document.getElementById('useLsl').checked = true; document.getElementById('useUsl').checked = true;
    document.getElementById('sub').value = '0';
    calc(false);
    const rows = [...document.querySelectorAll('#detail tbody tr')];
    const get = k => { const tr = rows.find(x => x.children[0].textContent.trim() === k); return tr ? tr.children[1].textContent.trim() : null; };
    const diag = [...document.querySelectorAll('#diagNote > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim());
    return { cpk: get('Cpk'), sw: get('组内 σ'), sort: diag.some(d => d.indexOf('疑似已按大小排序') >= 0), stab: diag.some(d => d.indexOf('组内 σ 远小于整体 σ') >= 0) };
  });
  console.log('19. 排序数据防呆:', sortedCase.sort && sortedCase.stab ? 'OK（Cpk=' + sortedCase.cpk + '，已提示排序 + 组内σ异常）' : 'FAIL ' + JSON.stringify(sortedCase));
  if (!sortedCase.sort || !sortedCase.stab) throw new Error('排序数据未触发防呆提示');
  if (sortedCase.sw === '0.0000') throw new Error('组内 σ 仍显示为 0.0000');

  console.log('--- 控制台错误数:', errors.length);
  errors.forEach(e => console.log('  ', e));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
