"""绘图模块：直方图、能力箱线图、正态概率图（JMP 风格）。"""
from __future__ import annotations

import numpy as np
import matplotlib

matplotlib.use("Agg")  # 无显示环境（服务器/Streamlit）必须
import matplotlib.pyplot as plt
from scipy import stats

# 配色（接近 JMP 的清爽风格）
C_DATA = "#4C78A8"
C_FIT = "#E45756"
C_LSL = "#54A24B"
C_USL = "#F58518"


def fig_histogram(x, usl=None, lsl=None, target=None, mean=None, sd=None) -> plt.Figure:
    """直方图 + 正态拟合曲线 + 规格线。"""
    x = np.asarray(x, dtype=float)
    if mean is None:
        mean = float(x.mean())
    if sd is None:
        sd = float(x.std(ddof=1))

    fig, ax = plt.subplots(figsize=(7, 4))
    ax.hist(x, bins="auto", density=True, color=C_DATA, alpha=0.7, edgecolor="white")
    xs = np.linspace(x.min(), x.max(), 200)
    ax.plot(xs, stats.norm.pdf(xs, mean, sd), color=C_FIT, lw=2, label="正态拟合")

    if lsl is not None:
        ax.axvline(lsl, color=C_LSL, ls="--", lw=2, label=f"LSL={lsl}")
    if usl is not None:
        ax.axvline(usl, color=C_USL, ls="--", lw=2, label=f"USL={usl}")
    if target is not None:
        ax.axvline(target, color="black", ls=":", lw=1.5, label=f"Target={target}")

    ax.set_title("直方图 + 正态曲线 + 规格限")
    ax.set_xlabel("测量值")
    ax.set_ylabel("密度")
    ax.legend()
    fig.tight_layout()
    return fig


def fig_quantile(x) -> plt.Figure:
    """正态概率图（Quantile Plot）：检验数据是否正态。"""
    x = np.asarray(x, dtype=float)
    x_sorted = np.sort(x)
    n = len(x_sorted)
    p = (np.arange(1, n + 1) - 0.5) / n
    q = stats.norm.ppf(p)

    slope, intercept, r, _, _ = stats.linregress(q, x_sorted)

    fig, ax = plt.subplots(figsize=(5, 5))
    ax.scatter(q, x_sorted, s=14, color=C_DATA, alpha=0.8)
    ax.plot(q, intercept + slope * q, color=C_FIT, lw=2, label=f"拟合 (R²={r ** 2:.3f})")
    ax.set_title("正态概率图 (Quantile Plot)")
    ax.set_xlabel("理论分位数")
    ax.set_ylabel("观测值")
    ax.legend()
    fig.tight_layout()
    return fig


def fig_capability_box(x, usl=None, lsl=None, target=None, mean=None) -> plt.Figure:
    """能力箱线图（JMP Capability Box Plot）：横向展示规格区间与数据分布。"""
    x = np.asarray(x, dtype=float)
    if mean is None:
        mean = float(x.mean())

    fig, ax = plt.subplots(figsize=(8, 2))
    if lsl is not None and usl is not None:
        ax.plot([lsl, usl], [1, 1], color="gray", lw=10,
                solid_capstyle="butt", alpha=0.25, label="规格区间")
    if lsl is not None:
        ax.axvline(lsl, color=C_LSL, ls="--", lw=1.5)
    if usl is not None:
        ax.axvline(usl, color=C_USL, ls="--", lw=1.5)

    q1, q2, q3 = np.percentile(x, [25, 50, 75])
    ax.broken_barh([(q1, q3 - q1)], (0.82, 0.36), facecolors=C_DATA, label="数据分布(IQR)")
    ax.plot(mean, 1, "o", color="black", ms=8, label="均值")

    if target is not None:
        ax.axvline(target, color="black", ls=":", lw=1, label="目标")

    ax.set_yticks([])
    ax.set_ylim(0.6, 1.4)
    ax.set_xlabel("测量值")
    ax.set_title("能力箱线图 (Capability Box Plot)")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.4), ncol=3, fontsize=8)
    fig.tight_layout()
    return fig
