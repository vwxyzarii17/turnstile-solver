FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

# penting untuk puppeteer-real-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 7860

CMD ["node", "index.js"]
