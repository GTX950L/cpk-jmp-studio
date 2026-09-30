// cpk-jmp-studio 修复回归套件（14 条，对应审查报告 P1-1 ~ P3-6）
// 用法：在本仓库目录起静态服务 python -m http.server 8004，然后 node _regress.js
const fs = require('fs'), os = require('os'), path = require('path');
const { chromium } = require('playwright');
const HTML = fs.readFileSync('cpk_calculator.html', 'utf8');
const MD = fs.readFileSync('README.md', 'utf8');
const OUT = []; let pass = 0, fail = 0;
function ok(id, tag, cond, extra) {
  if (cond) { pass++; OUT.push('  PASS ' + id + ' ' + tag); }
  else { fail++; OUT.push('  FAIL ' + id + ' ' + tag + (extra !== undefined ? '  → ' + extra : '')); }
}
function findChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  try {
    return fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d))
      .map(d => path.join(root, d, 'chrome-win64', 'chrome.exe')).filter(p => fs.existsSync(p)).pop();
  } catch (e) { return null; }
}

// ---------- 离线：纯计算段 eval ----------
const S = HTML.indexOf('<script>') + 8;
const E = HTML.indexOf('/* ============ 绘图 ============ */');
eval('function getCss(v){return "#888888";}\n' + HTML.slice(S, E));

// ---------- 离线：文本/源码断言 ----------
// R9 术语百科标点
{
  const s = HTML.indexOf('const GLOSS=['), e = HTML.indexOf('const GLOSS_CATS=');
  const n = (HTML.slice(s, e).match(/[\u4e00-\u9fa5][,;()?!]/g) || []).length;
  ok('R9', '术语百科无中文旁半角标点', n === 0, n + ' 处');
}
// R10 明细表行标签括号
{
  const seg = HTML.slice(HTML.indexOf('const rows=['), HTML.indexOf("document.querySelector('#detail tbody')"));
  const n = (seg.match(/[\u4e00-\u9fa5][()]/g) || []).length;
  ok('R10', '明细表标签无中文旁半角括号', n === 0, n + ' 处');
}
// R3 日期列
{
  const r = parseNums(['2026-09-01 10.01', '2026-09-02 10.02', '2026-09-03 9.99', '2026-09-04 10.00'].join('\n'));
  const clean = r.vals.every(v => v > 9 && v < 11) && r.vals.length === 4;
  ok('R3', '日期列不被当测量值 + 不触发子组推断', clean && !(r.uniformSub > 1), JSON.stringify(r.vals) + ' uniformSub=' + r.uniformSub);
}
// R13 边界口径
{
  const sorted = [9.9, 10.0, 10.1];
  const r = nonnormalCap(sorted, 9.9, 10.1);
  ok('R13', 'Ppk* 超规口径与实测一致（v==LSL 不算超规）', r.pL === 0 && r.pU === 0, JSON.stringify({ pL: r.pL, pU: r.pU }));
}
// R14 ± 公差表头
{
  const r = extractSpecFromText('规格 10±0.05');
  ok('R14', '表头「规格 10±0.05」可提取 LSL/USL', r.lsl === 9.95 && r.usl === 10.05, JSON.stringify(r));
}
// R2b 蒙特卡洛：个体模式 Cpk 95%CI 覆盖率 ≥94%
{
  // 复刻工具修复后应采用的 ν 公式：ν = max(2, 0.62(n−1))
  const nuFormula = n => Math.max(2, 0.62 * (n - 1));
  const rnd = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const T = 10, sig = 0.02, mu = 10 + 0.5 * sig, lsl = T - 4 * sig, usl = T + 4 * sig;
  const trueCpk = Math.min(usl - mu, mu - lsl) / (3 * sig);
  let hit = 0, tot = 0;
  for (let t = 0; t < 3000; t++) {
    const x = []; for (let i = 0; i < 60; i++) x.push(mu + rnd() * sig);
    const m = mean(x), sw = withinSigma(x, 0);
    const cpk = Math.min((usl - m) / (3 * sw), (m - lsl) / (3 * sw));
    const ci = ciIndexLike(cpk, nuFormula(60), 60);
    tot++; if (ci[0] != null && trueCpk >= ci[0] && trueCpk <= ci[1]) hit++;
  }
  const cov = hit / tot;
  ok('R2b', '个体模式 Cpk 95%CI 蒙特卡洛覆盖率 ≥94%（ν=0.62(n−1)）', cov >= 0.94, (cov * 100).toFixed(1) + '%');
}
// R5 README 文案
{
  ok('R5a', 'README 不再声称窄屏「横向滚动」', !/容器宽度不足 560px 时\*\*在图表区域内横向滚动\*\*/.test(MD));
  ok('R5b', 'README 说明窄屏改用更窄逻辑画布', /更窄的逻辑画布/.test(MD));
  ok('R5c', 'README 不再声称「偏差 < 5%」', !/偏差\s*<\s*5%/.test(MD));
}
// R4/R7 源码层：CSS 文字色变量
{
  ok('R7a', '定义图例文字深色变体 --c-lsl-ink / --c-usl-ink / --c-fit-ink',
    /--c-lsl-ink\s*:/.test(HTML) && /--c-usl-ink\s*:/.test(HTML) && /--c-fit-ink\s*:/.test(HTML));
}

// ---------- 在线：Playwright ----------
(async () => {
  const browser = await chromium.launch({ executablePath: findChromium() || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://127.0.0.1:8004/cpk_calculator.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { } });
  await page.click('#btnSample');
  await page.waitForFunction(() => document.querySelectorAll('#overallCap tbody tr').length > 0, null, { timeout: 30000 });

  // R4 汇总表术语
  const sum = await page.textContent('#summaryTable');
  ok('R4', '过程汇总表使用「组内 σ / 整体 σ」而非 Sigma', !/Sigma/.test(sum) && /组内\s*σ/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 80));

  // R12 aria-label
  const al = await page.getAttribute('#data', 'aria-label');
  ok('R12', '数据输入区有 aria-label', !!al && al.length > 2, String(al));

  // R2a 个体模式 CI 说明文案
  const ciRowTxt = await page.evaluate(() => {
    const tr = [...document.querySelectorAll('#detail tbody tr')].find(t => t.children[0].textContent.includes('Cpk 95%CI（组内）') || t.children[0].textContent.includes('Cpk 95%CI(组内)'));
    return tr ? tr.children[2].textContent : null;
  });
  ok('R2a', '个体模式 CI 说明反映有效自由度（含 ν≈ 且非 n−1）',
    !!ciRowTxt && /ν≈/.test(ciRowTxt) && !/ν=n−1/.test(ciRowTxt), String(ciRowTxt));

  // R1 + R6 生成器
  await page.evaluate(() => {
    const d = document.getElementById('genBox'); if (d) d.open = true;
    const set = (id, v) => { const el = document.getElementById(id); if (el) { el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('genCpk', 1.33); set('genN', 60); set('genLsl', 9.95); set('genUsl', 10.05); set('genMu', 10);
  });
  const before = await page.textContent('#msg');
  await page.click('#btnGen');
  await page.waitForTimeout(900);
  const after = await page.textContent('#msg');
  ok('R1', '生成器不抛异常且给出实测反馈（提示条含「实际 Cpk」）',
    /实际 Cpk/.test(after) && after !== before, '点击后提示条：' + after.trim().slice(0, 90));
  ok('R6', '生成器反馈同时给出组内 Cpk 与整体 Ppk', /Cpk（组内）/.test(after) && /Ppk（整体）/.test(after), after.trim().slice(0, 120));

  // R11 CSV 分区
  const csv = await page.evaluate(() => {
    let text = null; const orig = window.Blob;
    window.Blob = function (p, o) { if (o && o.type && String(o.type).indexOf('csv') >= 0) text = String(p[0]); return new orig(p, o); };
    const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { };
    document.getElementById('btnCsv').click();
    window.Blob = orig; HTMLAnchorElement.prototype.click = oc;
    return text;
  });
  const csvLines = (csv || '').split('\n').filter(l => l.trim());
  const heads = csvLines.filter(l => l.trim().startsWith('#'));
  ok('R11', '导出 CSV 用 # 分区标题分隔不同列数的区块', heads.length >= 2, '标题行 ' + heads.length + ' 条：' + heads.map(h => h.slice(0, 24)).join(' / '));

  // R7b 图例文字对比度
  const contrast = await page.evaluate(() => {
    function lum(c) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
    function parse(s) { const m = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/); return m ? [+m[1], +m[2], +m[3]] : null; }
    const bad = [];
    document.querySelectorAll('#wrap .legend span, .panel .legend span').forEach(el => {
      const t = (el.textContent || '').trim(); if (!t) return;
      const s = getComputedStyle(el); const fg = parse(s.color); if (!fg) return;
      const r = (Math.max(lum(fg), lum([255, 255, 255])) + 0.05) / (Math.min(lum(fg), lum([255, 255, 255])) + 0.05);
      if (r < 4.5) bad.push(t + ' ' + r.toFixed(2) + ':1 ' + s.color);
    });
    return bad;
  });
  ok('R7b', '图例文字对白底对比度均 ≥4.5:1', contrast.length === 0, contrast.slice(0, 5).join(' | '));

  // R8 画布文字重叠（1024 / 375）
  const overlaps = {};
  for (const w of [1024, 375]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(1000);
    overlaps[w] = await page.evaluate(() => {
      window.__t = [];
      const proto = CanvasRenderingContext2D.prototype, orig = proto.fillText;
      proto.fillText = function (t, x, y) {
        try {
          const m = this.getTransform(), fm = this.measureText(t), wt = fm.width;
          let x0 = x; if (this.textAlign === 'center') x0 = x - wt / 2; else if (this.textAlign === 'right' || this.textAlign === 'end') x0 = x - wt;
          const a = fm.actualBoundingBoxAscent || 8, d = fm.actualBoundingBoxDescent || 3;
          const pts = [[x0, y - a], [x0 + wt, y - a], [x0, y + d], [x0 + wt, y + d]].map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
          const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
          window.__t.push({ t: String(t), x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), c: this.canvas.id });
        } catch (e) { }
        return orig.apply(this, arguments);
      };
      window.calc(false); proto.fillText = orig;
      const T = window.__t; let n = 0;
      for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
        const a = T[i], b = T[j]; if (a.c !== b.c) continue;
        if (Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1) n++;
      }
      return n;
    });
  }
  ok('R8', '1024 / 375px 画布文字重叠 = 0 对', overlaps[1024] === 0 && overlaps[375] === 0, '1024:' + overlaps[1024] + ' 375:' + overlaps[375]);

  ok('R0', '页面无 pageerror', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ---- 排序 / 组内 σ 虚高防呆（v2.17.0）----
  const genData = (n, dp, sd) => {
    let sd0 = sd;
    const rr = () => { sd0 = (sd0 * 1103515245 + 12345) % 2147483648; return sd0 / 2147483648; };
    const gg = () => { let u = 0, v = 0; while (u === 0)u = rr(); while (v === 0)v = rr(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const a = []; for (let i = 0; i < n; i++)a.push(+(10 + 0.015 * gg()).toFixed(dp));
    return a;
  };
  const feed = arr => page.evaluate(a => {
    document.getElementById('data').value = a.join('\n');
    document.getElementById('useLsl').checked = true; document.getElementById('useUsl').checked = true;
    document.getElementById('lsl').value = '9.9'; document.getElementById('usl').value = '10.1';
    document.getElementById('sub').value = '0';
    calc(false);
    const rows = [...document.querySelectorAll('#detail tbody tr')];
    const get = k => { const tr = rows.find(x => x.children[0].textContent.trim() === k); return tr ? tr.children[1].textContent.trim() : null; };
    const diag = [...document.querySelectorAll('#diagNote > div')].map(d => d.textContent.replace(/\s+/g, ' ').trim());
    return { cpk: get('Cpk'), sw: get('组内 σ'), stab: get('稳定性指标'),
             hasSort: diag.some(d => d.indexOf('疑似已按大小排序') >= 0),
             hasStab: diag.some(d => d.indexOf('组内 σ 远小于整体 σ') >= 0) };
  }, arr);
  const sorted1 = await feed(genData(2000, 5, 777).sort((x, y) => x - y));
  ok('R19', '排序 2000 点：同时给出「疑似已排序」与「组内 σ 远小于整体 σ」提示', sorted1.hasSort && sorted1.hasStab, JSON.stringify({ cpk: sorted1.cpk, stab: sorted1.stab }));
  ok('R20', '组内 σ 极小值不显示为 0.0000', sorted1.sw !== '0.0000', '实际 ' + sorted1.sw);
  const sorted2 = await feed(genData(2000, 3, 999).sort((x, y) => x - y));
  ok('R21', '粗分辨率（3 位小数，相等对约 95%）排序同样检出', sorted2.hasSort && sorted2.hasStab, JSON.stringify({ cpk: sorted2.cpk }));
  const plain = await feed(genData(2000, 5, 1234));
  ok('R22', '未排序数据不误报（排序 / 稳定性两条都不出现）', !plain.hasSort && !plain.hasStab, JSON.stringify({ cpk: plain.cpk, stab: plain.stab }));
  const part = genData(2000, 3, 555);
  const partSorted = [...part].sort((x, y) => x - y).map(v => Math.random() < 0.9 ? v : part[Math.floor(Math.random() * part.length)]);
  const partRes = await feed(partSorted);
  ok('R23', '部分排序（90%）由稳定性哨兵兜底', partRes.hasStab, '稳定性=' + partRes.stab);

  console.log(OUT.join('\n'));
  console.log('---- PASS=' + pass + '  FAIL=' + fail + ' ----');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log(OUT.join('\n')); console.error('SCRIPT ERROR: ' + e.message); process.exit(1); });
