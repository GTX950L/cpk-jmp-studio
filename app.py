"""Cpk-JMP Studio —— 类 JMP 过程能力分析（Streamlit 主程序）。"""
from __future__ import annotations

import os
import numpy as np
import pandas as pd
import streamlit as st

from src import data_io, stats, charts

st.set_page_config(page_title="Cpk-JMP Studio", layout="wide")

# ------------------------- 页面标题 -------------------------
st.title("📊 Cpk-JMP Studio")
st.caption("模仿 JMP 的 Process Capability：上传数据 → 设规格限 → 算能力指数 + 画图")
st.markdown(
    "🔗 [📂 项目仓库 / 源码（GitHub）](https://github.com/GTX950L/cpk-jmp-studio) "
    "· 💡 想零安装使用？直接下载 [`cpk_calculator.html`](https://github.com/GTX950L/cpk-jmp-studio/blob/main/cpk_calculator.html) 双击浏览器打开即可"
)

_BASE = os.path.dirname(os.path.abspath(__file__))
_SAMPLE = os.path.join(_BASE, "examples", "sample_data.csv")


def _fmt(v, nd=3):
    """格式化数值：NaN 显示为 —，inf 显示为 ∞。"""
    if v is None or (isinstance(v, float) and (np.isnan(v) or np.isinf(v))):
        return "—"
    return f"{v:.{nd}f}"


# ------------------------- 侧边栏：数据 -------------------------
with st.sidebar:
    st.header("① 数据")
    uploaded = st.file_uploader("上传 CSV / Excel", type=["csv", "xlsx", "xls"])
    if st.button("载入示例数据"):
        uploaded = "SAMPLE"

# ------------------------- 读取数据 -------------------------
if uploaded is None:
    st.info("👈 请在左侧上传测量数据，或点击「载入示例数据」查看效果。"
            " 也有「📋 快速粘贴计算」页面：直接粘贴原始数据即可算 Cpk。")
    st.stop()

if uploaded == "SAMPLE":
    df = pd.read_csv(_SAMPLE)
else:
    try:
        df = data_io.load_data(uploaded)
    except Exception as e:
        st.error(f"读取失败：{e}")
        st.stop()

num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
if not num_cols:
    st.error("数据中未找到数值列，无法分析。")
    st.stop()

st.subheader("数据预览")
st.dataframe(df.head(20), use_container_width=True)

# ------------------------- 侧边栏：分析参数 -------------------------
with st.sidebar:
    st.header("② 分析设置")
    col = st.selectbox("测量列", num_cols)
    x = df[col].dropna().astype(float).values

    use_lsl = st.checkbox("启用下限 LSL", value=True)
    use_usl = st.checkbox("启用上限 USL", value=True)

    default_mean, default_sd = float(np.mean(x)), float(np.std(x, ddof=1))
    lsl = st.number_input("下限 LSL", value=float(default_mean - 3 * default_sd)) if use_lsl else None
    usl = st.number_input("上限 USL", value=float(default_mean + 3 * default_sd)) if use_usl else None
    target = st.number_input("目标值 Target", value=float((lsl or default_mean) + (usl or default_mean)) / 2
                             if (lsl is not None or usl is not None) else default_mean)
    subgroup = st.number_input("子组大小（0 = 个体测量）", min_value=0, max_value=20, value=0)

# ------------------------- 计算 -------------------------
try:
    res = stats.capability(x, usl, lsl, target, subgroup if subgroup > 0 else None)
except Exception as e:
    st.error(f"计算出错：{e}")
    st.stop()

# ------------------------- 指标卡片 -------------------------
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

# ------------------------- 图表 -------------------------
st.subheader("图表")
tab1, tab2, tab3 = st.tabs(["直方图 + 规格线", "能力箱线图", "正态概率图"])

with tab1:
    st.pyplot(charts.fig_histogram(x, usl, lsl, target,
                                   mean=res["mean"], sd=res["sd_overall"]))
with tab2:
    st.pyplot(charts.fig_capability_box(x, usl, lsl, target, mean=res["mean"]))
with tab3:
    st.pyplot(charts.fig_quantile(x))

# ------------------------- 明细表 -------------------------
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
