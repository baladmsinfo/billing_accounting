FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Prisma client setup
COPY prisma ./prisma
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma migrate resolve --applied 20260109122225_add_shipped_to_fulfillment_status
RUN npx prisma generate

# Copy app source
COPY . .

EXPOSE 3000

# Run migrations, then run seeds (Currency first), then start server
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]
