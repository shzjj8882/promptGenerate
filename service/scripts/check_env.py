"""
测试环境变量加载
用于验证 .env 文件是否正确配置
"""
from app.core.config import settings
import os


def main():
    """主函数"""
    print("=" * 60)
    print("环境变量配置检查")
    print("=" * 60)
    
    # 检查 .env 文件是否存在
    env_file_exists = os.path.exists(".env")
    print(f"📄 .env 文件: {'✅ 存在' if env_file_exists else '❌ 不存在'}")
    if not env_file_exists:
        print("   提示: 请运行 cp env.template .env 创建 .env 文件")
    print()
    
    print("当前配置值:")
    print("-" * 60)
    print(f"应用名称: {settings.APP_NAME}")
    print(f"调试模式: {settings.DEBUG}")
    print()
    
    print("PostgreSQL 配置:")
    print(f"  主机: {settings.POSTGRES_HOST}")
    print(f"  端口: {settings.POSTGRES_PORT}")
    print(f"  用户: {settings.POSTGRES_USER}")
    print(f"  密码: {'*' * len(settings.POSTGRES_PASSWORD) if settings.POSTGRES_PASSWORD else '(空)'}")
    print(f"  数据库: {settings.POSTGRES_DB}")
    print()
    
    print("Redis 配置:")
    print(f"  主机: {settings.REDIS_HOST}")
    print(f"  端口: {settings.REDIS_PORT}")
    print(f"  密码: {'*' * len(settings.REDIS_PASSWORD) if settings.REDIS_PASSWORD else '(空)'}")
    print(f"  数据库: {settings.REDIS_DB}")
    print()
    
    print("CORS 配置:")
    print(f"  允许的源: {', '.join(settings.CORS_ORIGINS)}")
    print()
    
    print("JWT 配置:")
    print(f"  算法: {settings.ALGORITHM}")
    print(f"  过期时间: {settings.ACCESS_TOKEN_EXPIRE_MINUTES} 分钟")
    print(f"  密钥: {'*' * 20}... (已隐藏)")
    print()
    
    print("=" * 60)
    
    # 检查关键配置
    warnings = []
    if settings.SECRET_KEY == "your-secret-key-here-change-in-production":
        warnings.append("⚠️  SECRET_KEY 仍使用默认值，生产环境请务必修改！")
    
    if settings.POSTGRES_PASSWORD == "postgres":
        warnings.append("⚠️  PostgreSQL 密码仍使用默认值，建议修改")
    
    if warnings:
        print("警告:")
        for warning in warnings:
            print(f"  {warning}")
        print()
    
    print("✅ 环境变量加载成功")
    print("=" * 60)


if __name__ == "__main__":
    main()

