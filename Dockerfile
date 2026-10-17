FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
USER node
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787
CMD ["node","server/index.js"]
