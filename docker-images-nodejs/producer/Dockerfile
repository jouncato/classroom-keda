FROM node:23-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install --production

FROM node:23-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Añadir usuario no privilegiado
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

CMD ["node", "index.js"]