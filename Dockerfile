FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html app.js sw.js manifest.webmanifest /usr/share/nginx/html/
COPY icons /usr/share/nginx/html/icons
COPY shared /usr/share/nginx/html/shared
COPY manager /usr/share/nginx/html/manager
EXPOSE 80
