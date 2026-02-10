FROM nginx:1.25-alpine

# 复制 Nginx 配置文件
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# 暴露端口
EXPOSE 3000

# 启动 Nginx
CMD ["nginx", "-g", "daemon off;"]
