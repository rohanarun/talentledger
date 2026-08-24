FROM node:22-alpine

WORKDIR /app
COPY --chown=node:node package.json product-manifest.json LICENSE README.md SECURITY.md ./
COPY --chown=node:node src ./src
COPY --chown=node:node web ./web

ENV HOST=0.0.0.0
ENV PORT=4173
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4173/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "src/web-server.mjs"]
