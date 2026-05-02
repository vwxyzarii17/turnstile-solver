FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 7860

CMD ["node", "index.js"]
