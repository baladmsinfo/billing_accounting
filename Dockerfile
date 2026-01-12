FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Prisma client setup
COPY prisma ./prisma
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma migrate deploy
RUN npx prisma generate

# Copy app source
COPY . .

EXPOSE 3000

# Run migrations, then run seeds (Currency first), then start server
CMD ["sh", "-c", "npm run seed && npm start"]
