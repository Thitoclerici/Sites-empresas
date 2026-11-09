# Imagem de produção do Prospecta (Hub + API + links públicos).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/var/data NODE_NO_WARNINGS=1
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npx", "tsx", "server/src/index.ts"]
