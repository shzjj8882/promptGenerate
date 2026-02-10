# 导入 admin 路由
from app.routers import admin

# 导入 api 路由（从 api.py 文件导入）
# 注意：由于存在 api.py 文件和 api/ 目录，需要先确保 api/ 目录被识别为包
# 然后再导入 api.py 文件
import sys
import importlib.util
import os
import importlib

# 先导入 api/ 目录（包），确保它被注册到 sys.modules
# 使用不同的模块名称避免与 api.py 文件冲突
try:
    # 导入 api/ 目录的 __init__.py，确保目录被识别为包
    api_package = importlib.import_module("app.routers.api")
    # 保存 api/ 包的引用，防止被覆盖
    _api_package_ref = api_package
except ImportError:
    _api_package_ref = None

# 获取 api.py 的完整路径并导入
api_py_path = os.path.join(os.path.dirname(__file__), "api.py")
spec = importlib.util.spec_from_file_location("app.routers.api_routes", api_py_path)
api_routes_module = importlib.util.module_from_spec(spec)

# 在执行 api.py 之前，确保 api/ 包在 sys.modules 中
# 这样 api.py 中的导入才能找到 api/ 目录
if "app.routers.api" not in sys.modules and _api_package_ref:
    sys.modules["app.routers.api"] = _api_package_ref

spec.loader.exec_module(api_routes_module)

# 创建统一的命名空间
api = api_routes_module

__all__ = ["admin", "api"]

