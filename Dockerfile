FROM node:20-slim

WORKDIR /app

# install minimal deps untuk puppeteer + xvfb
RUN apt-get update && apt-get install -y \
    xvfb \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libnss3 \
    libx11-xcb1 \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxi6 \
    libxtst6 \
    ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# pakai chromium, bukan chrome manual
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8080

CMD ["node", "index.js"]
