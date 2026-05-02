FROM node:20-bullseye

WORKDIR /app

RUN apt-get update && apt-get install -y \
    chromium \
    ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# 🔥 FIX untuk puppeteer-real-browser
ENV CHROME_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 7860

CMD ["node", "index.js"]
