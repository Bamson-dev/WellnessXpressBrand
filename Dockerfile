# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --libc=musl

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_DEPLOYMENT_ID=
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
RUN node -e 'const k=process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY; if(!k) { console.error("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY is required for stable Server Actions across deployments."); process.exit(1); } const b=Buffer.from(k,"base64"); if (![16,24,32].includes(b.length)) { console.error("NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must decode to 16, 24, or 32 bytes."); process.exit(1); }'
ARG NEXT_PUBLIC_SITE_URL=https://wellnessxpressbrand.com
ARG NEXT_PUBLIC_WHATSAPP_NUMBER=
ARG NEXT_PUBLIC_CONTACT_EMAIL=
ARG NEXT_PUBLIC_GA_ID=
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
ARG NEXT_PUBLIC_META_PIXEL_ID=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_WHATSAPP_NUMBER=$NEXT_PUBLIC_WHATSAPP_NUMBER \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID
RUN if [ -z "$NEXT_DEPLOYMENT_ID" ]; then NEXT_DEPLOYMENT_ID="deploy-$(date +%s)-$(head -c 8 /dev/urandom | od -An -tx1 | tr -d ' \n')"; fi && NEXT_DEPLOYMENT_ID="$NEXT_DEPLOYMENT_ID" echo "$NEXT_DEPLOYMENT_ID" > /app/.deployment-id && NEXT_DEPLOYMENT_ID="$NEXT_DEPLOYMENT_ID" npm run build

FROM node:22-alpine AS run
WORKDIR /app
# The Server Actions encryption key is embedded during the build. Do not override
# it at runtime with a separately supplied value, which can cause key drift.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DATA_DIR=/data
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.deployment-id ./.deployment-id
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["sh", "-c", "export NEXT_DEPLOYMENT_ID=$(cat /app/.deployment-id); exec node server.js"]
