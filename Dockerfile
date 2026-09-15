# ビルド工程はない（バンドラもトランスパイラも使っていない）。
# 本番依存のインストールと起動だけ。
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# 依存だけ先に入れて、ソース変更時にこの層を再利用する
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# SQLite の置き場。永続ボリュームをここにマウントする。
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

ENV PORT=8080 \
    DB_PATH=/data/help.db

EXPOSE 8080
USER node

# --env-file-if-exists は使わない。本番の値はプラットフォームの環境変数で渡す。
CMD ["node", "src/server.js"]
