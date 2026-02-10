/**
 * PM2 生态系统配置文件
 * 用于管理前端和后端服务
 * 
 * 注意：环境变量需要手动设置或通过启动脚本加载
 * PM2 不支持 env_file，环境变量通过以下方式加载：
 * 1. 在启动脚本中使用 dotenv 或 source .env
 * 2. 使用 pm2 start ecosystem.config.js --update-env
 * 3. 在启动前手动 export 环境变量
 * 
 * 使用方式：
 *   pm2 start ecosystem.config.js          # 启动所有服务
 *   pm2 stop ecosystem.config.js           # 停止所有服务
 *   pm2 restart ecosystem.config.js        # 重启所有服务
 *   pm2 delete ecosystem.config.js         # 删除所有服务
 *   pm2 logs                                # 查看所有日志
 *   pm2 monit                               # 监控面板
 */

const fs = require('fs');
const path = require('path');

// 加载环境变量文件的辅助函数
function loadEnvFile(filePath) {
  const env = {};
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          env[key.trim()] = value.trim();
        }
      }
    });
  }
  return env;
}

// 加载 PM2 环境变量
const pm2Env = loadEnvFile(path.join(__dirname, '.env'));

// 加载后端环境变量
const serviceEnv = loadEnvFile(path.join(__dirname, '../service/.env'));

module.exports = {
  apps: [
    {
      name: 'aily-service',
      script: './start-pm2.sh',
      cwd: '../service',
      interpreter: 'bash',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // 从 service/.env 文件加载的环境变量
        // Python 应用会优先使用环境变量，然后才读取 .env 文件
        DEBUG: serviceEnv.DEBUG || 'False',
        APP_NAME: serviceEnv.APP_NAME || 'AILY API',
        // 如果未设置 ENV，使用 development（允许使用默认 SECRET_KEY）
        ENV: serviceEnv.ENV || 'development',
        // PostgreSQL 配置
        POSTGRES_HOST: serviceEnv.POSTGRES_HOST || 'localhost',
        POSTGRES_PORT: serviceEnv.POSTGRES_PORT || '5432',
        POSTGRES_USER: serviceEnv.POSTGRES_USER || 'postgres',
        POSTGRES_PASSWORD: serviceEnv.POSTGRES_PASSWORD || 'postgres',
        POSTGRES_DB: serviceEnv.POSTGRES_DB || 'aily_db',
        // Redis 配置
        REDIS_HOST: serviceEnv.REDIS_HOST || 'localhost',
        REDIS_PORT: serviceEnv.REDIS_PORT || '6379',
        REDIS_PASSWORD: serviceEnv.REDIS_PASSWORD || '',
        REDIS_DB: serviceEnv.REDIS_DB || '0',
        // CORS 配置
        CORS_ORIGINS: serviceEnv.CORS_ORIGINS || 'http://localhost:3000',
        // JWT 配置
        SECRET_KEY: serviceEnv.SECRET_KEY || 'your-secret-key-here-change-in-production',
        ALGORITHM: serviceEnv.ALGORITHM || 'HS256',
        ACCESS_TOKEN_EXPIRE_MINUTES: serviceEnv.ACCESS_TOKEN_EXPIRE_MINUTES || '30',
        // API Key（可选）
        API_KEY: serviceEnv.API_KEY || '',
        // DeepSeek API 配置
        DEEPSEEK_API_KEY: serviceEnv.DEEPSEEK_API_KEY || '',
        DEEPSEEK_API_BASE: serviceEnv.DEEPSEEK_API_BASE || 'https://api.deepseek.com/v1',
        DEEPSEEK_MODEL: serviceEnv.DEEPSEEK_MODEL || 'deepseek-chat',
      },
      // 日志配置
      error_file: './logs/service-error.log',
      out_file: './logs/service-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // 健康检查
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
    {
      name: 'aily-app',
      script: 'node',
      args: 'server.js',
      cwd: '../app/.next/standalone',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
        // 从 pm2/.env 加载的环境变量
        DEPLOYMENT_MODE: pm2Env.DEPLOYMENT_MODE || 'pm2',
        USE_API_REWRITES: pm2Env.USE_API_REWRITES || 'false',
        BACKEND_URL: pm2Env.BACKEND_URL || '',
        NEXT_PUBLIC_API_BASE_URL: pm2Env.NEXT_PUBLIC_API_BASE_URL || '',
      },
      // 日志配置
      error_file: './logs/app-error.log',
      out_file: './logs/app-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // 自动重启配置
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      // 健康检查
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
    },
  ],
};
