# Cpk-JMP Studio

[![Open in Streamlit](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://share.streamlit.io/deploy?repository=https://github.com/GTX950L/cpk-jmp-studio)

> 🔗 项目仓库：[github.com/GTX950L/cpk-jmp-studio](https://github.com/GTX950L/cpk-jmp-studio)
> 🚀 点上方徽章 **Open in Streamlit** 即可一键部署并在线进入使用（无需本地安装）。

一个模仿 **JMP**「Process Capability（过程能力分析）」体验的轻量工具：上传测量数据 → 设定规格限 → 一键得到 Cp / Cpk / Pp / Ppk / Cpm 等能力指数，并自动绘制直方图、能力箱线图、正态概率图。

适合制造业质量管理、设备保养记录、SPC 分析等场景。基于 Python + Streamlit，你熟稔的 pandas 栈，改起来零门槛。

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

## 📝 在 GitHub 上创建并推送

```bash
# 在 GitHub 网页新建空仓库（不要勾选 README/LICENSE）
git init
git add .
git commit -m "feat: 类 JMP 的 Cpk 能力分析工具"
git branch -M main
git remote add origin https://github.com/GTX950L/cpk-jmp-studio.git
git push -u origin main
```

## 📄 许可证

MIT
