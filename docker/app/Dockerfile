# 前端应用 Dockerfile
# 多阶段构建：构建阶段
FROM node:20-alpine AS builder

# 构建参数（用于注入环境变量）
ARG DEPLOYMENT_MODE=docker
ARG NEXT_PUBLIC_API_BASE_URL=
ARG BACKEND_URL=http://service:8000

# 设置工作目录
WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件
COPY app/package.json app/pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY app/ .

# 设置构建时环境变量
ENV DEPLOYMENT_MODE=${DEPLOYMENT_MODE}
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV BACKEND_URL=${BACKEND_URL}

# 构建应用（standalone 模式）
RUN pnpm build

# 生产阶段
FROM node:20-alpine AS runner

# 设置工作目录
WORKDIR /app

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 从构建阶段复制必要文件
# Next.js standalone 模式会将所有依赖打包到 .next/standalone 目录
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 设置环境变量
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

USER nextjs

# 暴露端口
EXPOSE 3000

# 健康检查（使用 /health 端点，通过 rewrites 代理到后端）
HEALTHCHECK --interval=60s --timeout=5s --start-period=40s --retries=2 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {let data='';r.on('data',(c)=>{data+=c});r.on('end',()=>{const ok=r.statusCode===200&&data.includes('healthy');process.exit(ok?0:1)})}).on('error',()=>process.exit(1))"

# 启动命令（standalone 模式下的 server.js）
CMD ["node", "server.js"]
