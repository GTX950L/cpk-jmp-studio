"""数据读取模块：支持 CSV / Excel。"""
import pandas as pd


def load_data(uploaded_file) -> pd.DataFrame:
    """从 Streamlit 上传对象读取为 DataFrame。

    Args:
        uploaded_file: st.file_uploader 返回的上传文件对象。

    Returns:
        pd.DataFrame：原始数据表。
    """
    name = uploaded_file.name.lower()
    if name.endswith(".csv"):
        return pd.read_csv(uploaded_file)
    if name.endswith((".xlsx", ".xls")):
        return pd.read_excel(uploaded_file)
    raise ValueError("仅支持 CSV / Excel 文件，请重新上传。")
