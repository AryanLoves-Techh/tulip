FROM node:24-slim
WORKDIR /app

# match your local versions: run `node -v` and `pnpm -v`
RUN npm install -g pnpm@12.10.1

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile

CMD ["pnpm", "--filter", "demo-api", "start"]