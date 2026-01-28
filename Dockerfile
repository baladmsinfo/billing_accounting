FROM node:20
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Prisma client if needed
COPY prisma ./prisma
RUN npx prisma migrate deploy 
RUN npx prisma generate

# Seed after code is available
RUN npm run seed

# Start Fastify app (CommonJS entrypoint)
EXPOSE 3000
CMD ["npm", "run", "start"]

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
