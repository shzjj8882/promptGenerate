import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式（用于 Docker 部署和 PM2 部署）
  output: 'standalone',
  
  // 使用 rewrites 将后端 API 请求代理到后端服务
  // 通过 DEPLOYMENT_MODE 环境变量区分部署模式：
  // - dev: 调试模式（app/.env.local），前端直接调用后端，不使用 rewrites
  // - docker-nginx: Docker Nginx 模式（docker/.env），使用 Nginx 代理，不使用 rewrites
  // - pm2: PM2 模式（pm2/ 目录），根据 USE_API_REWRITES 决定是否使用 rewrites
  async rewrites() {
    // 默认使用 dev 模式（开发环境）
    const deploymentMode = process.env.DEPLOYMENT_MODE || 'dev';
    const useRewrites = process.env.USE_API_REWRITES === 'true';
    
    // 调试模式：不使用 rewrites，前端直接调用后端
    if (deploymentMode === 'dev') {
      console.log(`[Next.js Config] Deployment mode: dev - Direct API calls (no rewrites)`);
      return [];
    }
    
    // Docker Nginx 模式：使用 Nginx 代理，不使用 Next.js rewrites（支持 SSE）
    if (deploymentMode === 'docker-nginx') {
      console.log(`[Next.js Config] Deployment mode: docker-nginx - Using Nginx proxy (no rewrites, SSE supported)`);
      return [];
    }
    
    // PM2 模式：根据 USE_API_REWRITES 决定
    if (deploymentMode === 'pm2') {
      if (useRewrites) {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
        console.log(`[Next.js Config] Deployment mode: pm2 - Using rewrites proxy to: ${backendUrl}`);
        
        return [
          {
            source: '/api/:path*',
            destination: `${backendUrl}/api/:path*`,
          },
          {
            source: '/admin/:path*',
            destination: `${backendUrl}/admin/:path*`,
          },
          {
            source: '/docs',
            destination: `${backendUrl}/docs`,
          },
          {
            source: '/openapi.json',
            destination: `${backendUrl}/openapi.json`,
          },
          {
            source: '/health',
            destination: `${backendUrl}/health`,
          },
        ];
      } else {
        console.log(`[Next.js Config] Deployment mode: pm2 - Direct API calls (no rewrites)`);
        return [];
      }
    }
    
    // 默认：不使用 rewrites
    console.log(`[Next.js Config] Unknown deployment mode: ${deploymentMode} - Using direct API calls`);
    return [];
  },
};

export default nextConfig;
