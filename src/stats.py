"""过程能力分析计算模块（模仿 JMP Process Capability）。

核心思想：
- 组内 sigma（σ_within）：反映「短期内」的过程波动，用于 Cp / Cpk。
    个体测量用移动极差法 σ = MR̄ / d2(2)；子组用极差法 σ = R̄ / d2(n)。
- 整体 sigma（σ_overall）：样本标准差 s（ddof=1），反映「长期」波动，用于 Pp / Ppk。
"""
from __future__ import annotations

import numpy as np
from scipy import stats

# 不同子组大小对应的 d2 常数（无偏估计用）
D2 = {2: 1.128, 3: 1.693, 4: 2.059, 5: 2.326,
      6: 2.534, 7: 2.704, 8: 2.847, 9: 2.970, 10: 3.078}


def _within_sigma(x: np.ndarray, subgroup_size: int | None) -> float:
    """计算组内 sigma。

    Args:
        x: 一维测量数组（已去除 NaN）。
        subgroup_size: 子组大小；None 或 <=1 表示个体测量。

    Returns:
        组内标准差估计值。
    """
    if subgroup_size and subgroup_size > 1:
        n = int(subgroup_size)
        # 数据按每 n 个一组排列，丢弃不足一组的尾部
        tail = len(x) % n
        if tail:
            x = x[: len(x) - tail]
        groups = x.reshape(-1, n)
        ranges = groups.max(axis=1) - groups.min(axis=1)
        r_bar = ranges.mean()
        d2 = D2.get(n, 3.078)
        return float(r_bar / d2)
    # 个体测量：移动极差法（JMP 默认）
    mr = np.abs(np.diff(x))
    return float(mr.mean() / D2[2])


def capability(
    x,
    usl: float | None = None,
    lsl: float | None = None,
    target: float | None = None,
    subgroup_size: int | None = None,
) -> dict:
    """计算完整能力指标。

    Args:
        x: 测量数据（list / ndarray / Series）。
        usl: 规格上限，None 表示无上限（单侧）。
        lsl: 规格下限，None 表示无下限（单侧）。
        target: 目标值，None 时取上下限中点（仅有一侧则取该侧）。
        subgroup_size: 子组大小，None/<=1 为个体测量。

    Returns:
        包含所有指标与统计量的字典。
    """
    x = np.asarray(x, dtype=float)
    x = x[~np.isnan(x)]
    n = len(x)
    if n < 2:
        raise ValueError("数据量至少需要 2 个有效测量值。")

    mean = float(x.mean())
    sd_overall = float(x.std(ddof=1))
    sd_within = _within_sigma(x, subgroup_size)

    # 目标值缺省处理
    if target is None:
        if usl is not None and lsl is not None:
            target = (usl + lsl) / 2
        elif usl is not None:
            target = usl
        elif lsl is not None:
            target = lsl
        else:
            target = mean

    has_lsl = lsl is not None
    has_usl = usl is not None

    # ---- Cp / Cpk（组内）----
    cp = (usl - lsl) / (6 * sd_within) if (has_lsl and has_usl) else float("nan")
    cpu = (usl - mean) / (3 * sd_within) if has_usl else np.inf
    cpl = (mean - lsl) / (3 * sd_within) if has_lsl else np.inf
    cpk = min(cpu, cpl)

    # ---- Pp / Ppk（整体）----
    pp = (usl - lsl) / (6 * sd_overall) if (has_lsl and has_usl) else float("nan")
    ppu = (usl - mean) / (3 * sd_overall) if has_usl else np.inf
    ppl = (mean - lsl) / (3 * sd_overall) if has_lsl else np.inf
    ppk = min(ppu, ppl)

    # ---- Cpm（考虑目标偏移）----
    cpm = (
        (usl - lsl) / (6 * np.sqrt(sd_overall**2 + (mean - target) ** 2))
        if (has_lsl and has_usl)
        else float("nan")
    )

    # ---- PPM（理论，正态近似）----
    def _ppm(sigma: float) -> float:
        p_above = 1 - stats.norm.cdf(usl, mean, sigma) if has_usl else 0.0
        p_below = stats.norm.cdf(lsl, mean, sigma) if has_lsl else 0.0
        return 1e6 * (p_above + p_below)

    ppm_overall = _ppm(sd_overall)
    ppm_within = _ppm(sd_within)

    # ---- 实测超规比例 ----
    obs_above = np.sum(x > usl) if has_usl else 0
    obs_below = np.sum(x < lsl) if has_lsl else 0
    obs_ppm = 1e6 * (obs_above + obs_below) / n

    # ---- 正态性检验 ----
    if n <= 5000:
        w, p = stats.shapiro(x)
        norm_test = {"name": "Shapiro-Wilk", "statistic": float(w), "p_value": float(p)}
    else:
        res = stats.anderson(x, dist="norm")
        norm_test = {"name": "Anderson-Darling", "statistic": float(res.statistic), "p_value": None}

    return {
        "n": n,
        "mean": mean,
        "target": float(target),
        "sd_overall": sd_overall,
        "sd_within": sd_within,
        "cp": cp,
        "cpk": cpk,
        "pp": pp,
        "ppk": ppk,
        "cpm": cpm,
        "ppm_overall": ppm_overall,
        "ppm_within": ppm_within,
        "obs_ppm": obs_ppm,
        "norm_test": norm_test,
    }
