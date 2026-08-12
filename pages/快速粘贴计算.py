"""快速粘贴计算页：直接粘贴原始数据（无表头），输入规格限，得到 Cpk 与图表。

适合手头有一列/多列原始测量值、不想整理成 CSV 的场景。
"""
from __future__ import annotations

import os
import re
import sys

import numpy as np
import pandas as pd
import streamlit as st

# 保证 pages 子目录下也能 import 到 src 包
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src import stats, charts

st.set_page_config(page_title="快速粘贴计算", layout="wide")


# ------------------------- 数值解析 -------------------------
_NUM_RE = re.compile(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?")


def parse_numbers(text: str):
    """从任意文本中提取所有浮点数（自动扁平化多列/多行粘贴）。"""
    vals, skipped = [], 0
    for tok in _NUM_RE.findall(text):
        try:
            vals.append(float(tok))
        except ValueError:
            skipped += 1
    return np.asarray(vals, dtype=float), skipped


def _fmt(v, nd=3):
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return "—"
    return f"{v:.{nd}f}"


# ------------------------- 页面标题 -------------------------
st.title("📋 快速粘贴计算（无需表头）")
st.caption("把测量数据（纯数字，可多列/换行）直接粘进来，再填规格限，立刻出 Cpk 与图表。")

if "paste_text" not in st.session_state:
    st.session_state.paste_text = ""

col_btn1, _ = st.columns([1, 4])
with col_btn1:
    if st.button("填入示例数据"):
        rng = np.random.default_rng(0)
        sample = rng.normal(10.005, 0.012, 60)
        st.session_state.paste_text = "\n".join(f"{v:.4f}" for v in sample)
        st.rerun()

raw = st.text_area(
    "粘贴数据（去除表头，仅保留测量值）",
    height=200,
    key="paste_text",
    placeholder="例如：\n10.01\n9.98\n10.03\n9.97\n…（每行一个，或空格 / 逗号分隔均可）",
)

x, skipped = parse_numbers(raw)
if raw.strip():
    msg = f"已解析 **{len(x)}** 个数值"
    if skipped:
        msg += f"（跳过 {skipped} 个无法识别的内容）"
    st.info(msg)
elif raw == "":
    st.info("👈 在上方粘贴你的测量数据，或点「填入示例数据」体验。")

# ------------------------- 侧边栏：规格限 -------------------------
with st.sidebar:
    st.header("规格限")
    use_lsl = st.checkbox("启用最小值 LSL（下限）", value=True)
    use_usl = st.checkbox("启用最大值 USL（上限）", value=True)

    if len(x) > 0:
        dm, ds = float(x.mean()), float(x.std(ddof=1))
    else:
        dm, ds = 0.0, 1.0

    lsl = st.number_input("最小值 LSL", value=float(dm - 3 * ds)) if use_lsl else None
    usl = st.number_input("最大值 USL", value=float(dm + 3 * ds)) if use_usl else None
    target = st.number_input(
        "标准值 Target",
        value=float((lsl or dm) + (usl or dm)) / 2 if (lsl is not None or usl is not None) else dm,
    )
    subgroup = st.number_input("子组大小（0 = 个体测量）", min_value=0, max_value=20, value=0)

# ------------------------- 计算 + 展示 -------------------------
ready = len(x) >= 2 and (usl is not None or lsl is not None)
if not ready:
    if raw.strip() and len(x) < 2:
        st.warning("有效数据至少需要 2 个数值，请检查粘贴内容。")
    if raw.strip() and (usl is None and lsl is None):
        st.warning("请至少启用一个规格限（最小值或最大值）。")
    st.stop()

try:
    res = stats.capability(x, usl, lsl, target, subgroup if subgroup > 0 else None)
except Exception as e:
    st.error(f"计算出错：{e}")
    st.stop()

st.subheader("能力指数")
c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Cp（组内）", _fmt(res["cp"]))
c2.metric("Cpk（组内）", _fmt(res["cpk"]))
c3.metric("Pp（整体）", _fmt(res["pp"]))
c4.metric("Ppk（整体）", _fmt(res["ppk"]))
c5.metric("Cpm（含目标）", _fmt(res["cpm"]))

c6, c7, c8, c9, c10 = st.columns(5)
c6.metric("样本量 n", f"{res['n']}")
c7.metric("均值 μ", _fmt(res["mean"], 4))
c8.metric("组内 σ", _fmt(res["sd_within"], 4))
c9.metric("整体 σ", _fmt(res["sd_overall"], 4))
c10.metric("实测超规 PPM", f"{res['obs_ppm']:,.0f}")

nt = res["norm_test"]
norm_ok = (nt["p_value"] is not None and nt["p_value"] > 0.05)
st.info(
    f"正态性检验（{nt['name']}）：统计量 = {nt['statistic']:.4f}"
    f"{('，p = ' + format(nt['p_value'], '.4f')) if nt['p_value'] is not None else ''}"
    f" → {'数据近似正态，可用 Cpk 正态法 ✅' if norm_ok else '数据可能非正态，建议谨慎解读 ⚠️'}"
)

st.subheader("图表")
tab1, tab2, tab3 = st.tabs(["直方图 + 规格线", "能力箱线图", "正态概率图"])
with tab1:
    st.pyplot(charts.fig_histogram(x, usl, lsl, target, mean=res["mean"], sd=res["sd_overall"]))
with tab2:
    st.pyplot(charts.fig_capability_box(x, usl, lsl, target, mean=res["mean"]))
with tab3:
    st.pyplot(charts.fig_quantile(x))

with st.expander("查看全部指标明细"):
    detail = {
        "指标": ["样本量 n", "均值 μ", "目标 T", "组内 σ", "整体 σ",
                  "Cp", "Cpk", "Pp", "Ppk", "Cpm",
                  "理论超规 PPM(组内)", "理论超规 PPM(整体)", "实测超规 PPM"],
        "数值": [_fmt(res["n"], 0), _fmt(res["mean"], 4), _fmt(res["target"], 4),
                  _fmt(res["sd_within"], 4), _fmt(res["sd_overall"], 4),
                  _fmt(res["cp"]), _fmt(res["cpk"]), _fmt(res["pp"]),
                  _fmt(res["ppk"]), _fmt(res["cpm"]),
                  f"{res['ppm_within']:,.1f}", f"{res['ppm_overall']:,.1f}",
                  f"{res['obs_ppm']:,.1f}"],
    }
    st.table(pd.DataFrame(detail))
