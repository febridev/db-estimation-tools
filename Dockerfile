# Stage 1: Build dependencies dan kompilasi
FROM node:18-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Karena output: export, perintah ini akan menghasilkan folder "out" (bukan .next)
RUN npm run build

# Stage 2: Runner (Image produksi menggunakan Nginx)
FROM nginx:alpine AS runner

# Hapus aset bawaan Nginx
RUN rm -rf /usr/share/nginx/html/*

# Buat konfigurasi Nginx internal untuk mengekspos port 8001 dan routing Next.js
RUN echo "server { \
    listen 8001; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files \$uri \$uri.html \$uri/ /index.html; \
    } \
}" > /etc/nginx/conf.d/default.conf

# Salin aset statis hasil kompilasi dari stage builder
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 8001

CMD ["nginx", "-g", "daemon off;"]
