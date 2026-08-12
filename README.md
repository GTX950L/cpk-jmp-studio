# Cpk-JMP Studio

> 🟢 **最简单用法（推荐）**：下载 [`cpk_calculator.html`](https://github.com/GTX950L/cpk-jmp-studio/blob/main/cpk_calculator.html) → 双击用浏览器打开即可，**无需安装、无需联网、数据不出本机**，粘贴数据就能算 Cpk 并出图。
>
> 🔗 项目仓库：[github.com/GTX950L/cpk-jmp-studio](https://github.com/GTX950L/cpk-jmp-studio)

一个模仿 **JMP**「Process Capability（过程能力分析）」体验的轻量工具：给出测量数据与规格限 → 一键得到 Cp / Cpk / Pp / Ppk / Cpm 等能力指数，并自动绘制直方图、能力箱线图、正态概率图。

提供三种使用方式，按需选择：

| 方式 | 适用场景 | 门槛 |
|------|---------|------|
| **离线单文件 HTML**（`cpk_calculator.html`） | 手头有数据、想立刻算，最省事 | 零：双击浏览器打开即用 |
| **Streamlit 网页应用**（`app.py`） | 习惯 Python、想批量/上传文件分析 | 需 `pip install` 装依赖 |
| **快速粘贴计算页**（`pages/快速粘贴计算.py`） | Streamlit 下的「粘贴即用」模式 | 需装依赖 |

## ✨ 功能特性

- **完整 JMP 式能力分析**
  - 区分「组内 sigma（Cpk）」与「整体 sigma（Ppk）」，与 JMP 一致
  - 指数：Cp、Cpk、Pp、Ppk、Cpm、双侧/单侧
  - 理论超规 PPM（组内 & 整体）、实测超规 PPM
  - Shapiro-Wilk 正态性检验，判断能否用正态能力法
- **类 JMP 图表**
  - 直方图 + 正态拟合曲线 + 规格线（LSL / USL / Target）
  - 能力箱线图（Capability Box Plot，JMP 特有）
  - 正态概率图（Quantile Plot）
- **灵活数据**
  - 支持 CSV / Excel 上传，或一键载入示例
  - 支持个体测量（移动极差法）与子组数据（极差法）
  - 支持单侧规格（只有上限或只有下限）

## 🌐 离线单文件版（推荐，无需安装 / 无需联网）

**[`cpk_calculator.html`](https://github.com/GTX950L/cpk-jmp-studio/blob/main/cpk_calculator.html)** 是本项目最简单直接的入口：

- 下载后用任意浏览器**双击打开即可**，**完全离线运行**——计算与绘图全部由 JavaScript 实现（不依赖任何外部库 / CDN），数据不出本机
- 用法：粘贴数据（去表头）→ 点「计算 Cpk」，得到 Cp / Cpk / Pp / Ppk / Cpm 指标卡（按能力等级自动变色）+ 三张图（直方图+规格线、能力箱线图、正态概率图）
- 顶部还有**能力判级横幅**（A/B/C/D 级结论），并支持导出 CSV 指标与 PNG 图表
- 适合「手头有数据、只想立刻算一下」的场景，也是本仓库的**首选使用方式**

> 该版本的正态性检验采用 **Shapiro-Francia 近似（= Q-Q 图 R²）**，与 Python 版的 Shapiro-Wilk 略有不同，但结论一致；计算数值已用 `examples/sample_data.csv` 校验，与 Python 版完全一致。

## 📋 快速粘贴计算页（Streamlit 版，可选）

如果你更习惯在 Streamlit 里操作，除了「上传文件」主页面，还内置一个独立页面 **📋 快速粘贴计算**，专为「手头有一列原始数据、懒得存成文件」的场景（功能与离线 HTML 版一致）：

1. 在左侧页面导航切到 **快速粘贴计算**
2. 把数据（纯数字，**去掉表头**）直接粘进文本框——支持每行一个、空格或逗号分隔、甚至多列一起粘（会自动扁平化为一列）
3. 点「填入示例数据」可一键体验
4. 在左侧填入 **最小值 LSL / 最大值 USL**（标准值自动取中点），子组大小默认 0 = 个体测量
5. 下方实时给出 Cp / Cpk / Pp / Ppk / Cpm 指标卡 + 三张图

## 🚀 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/GTX950L/cpk-jmp-studio.git
cd cpk-jmp-studio

# 2. 创建虚拟环境（可选但推荐）
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 启动
streamlit run app.py
```

浏览器会自动打开 `http://localhost:8501`。点击侧边栏「载入示例数据」即可看到效果。

## 📁 项目结构

```
cpk-jmp-studio/
├── app.py              # Streamlit 主程序（交互入口）
├── requirements.txt    # 依赖
├── src/
│   ├── data_io.py      # 数据读取（CSV / Excel）
│   ├── stats.py        # 能力指数与正态检验计算
│   └── charts.py       # 绘图（直方图 / 箱线图 / 概率图）
├── examples/
│   └── sample_data.csv # 示例：轴径测量数据
└── README.md
```

## 📐 方法说明（公式）

| 指标 | 公式（双侧规格） | 说明 |
|------|----------------|------|
| 组内 sigma | `MR̄ / d2(2)` | 个体：移动极差均值 / 1.128 |
| 整体 sigma | 样本标准差 `s`（ddof=1） | 所有数据总体波动 |
| Cp | `(USL−LSL) / (6σ_within)` | 潜在过程能力 |
| Cpk | `min((USL−μ)/(3σ_within), (μ−LSL)/(3σ_within))` | 考虑偏移的能力 |
| Pp | `(USL−LSL) / (6σ_overall)` | 长期潜在能力 |
| Ppk | `min((USL−μ)/(3σ_overall), (μ−LSL)/(3σ_overall))` | 长期实际能力 |
| Cpm | `(USL−LSL) / (6√(σ_overall² + (μ−T)²))` | 考虑目标偏移 |

> 单侧规格时 Cp / Cpm 无定义（显示为 `—`），Cpk / Ppk 仍可计算对应方向。

## 📄 许可证

本项目以 [MIT 许可证](LICENSE) 开源。
