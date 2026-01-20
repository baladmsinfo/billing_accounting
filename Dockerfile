FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Prisma client setup
COPY prisma ./prisma
ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
RUN npx prisma generate

# Copy app source
COPY . .

# Run migrations and start Fastify
CMD ["sh", "-c", "npx prisma migrate deploy && npm run seed && npm start"]

EXPOSE 3000

# FROM node:20

# WORKDIR /app

# # Copy only package files first (to use Docker cache)
# COPY package*.json ./

# # Install dependencies
# RUN npm install

# # Copy Prisma schema
# COPY prisma ./prisma

# # --- FIX FOR PRISMA ENGINE DOWNLOAD ERROR ---
# ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
# # --------------------------------------------
# RUN npx prisma generate

# # Copy the entire app source
# COPY . .

# # Expose port
# EXPOSE 3000

# # Run Prisma migrations and start server
# CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
