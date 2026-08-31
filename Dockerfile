FROM node:18.2.0-alpine AS build

WORKDIR /app

COPY frontend/package.json .
COPY frontend/package-lock.json .

RUN npm install

COPY frontend .

RUN npm run build

FROM unit:1.32.1-python3.11

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends mime-support && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml pyproject.toml
COPY plexio plexio

RUN pip install -e . --no-cache-dir

RUN mkdir -p /app/data && chown -R unit:unit /app/data

COPY --from=build /app/dist frontend

COPY unit-nginx-config.json /docker-entrypoint.d/config.json

