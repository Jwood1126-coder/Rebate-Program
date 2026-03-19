FROM node:20-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy the FULL node_modules (not just standalone) so prisma + seed work
COPY --from=deps /app/node_modules ./node_modules

# Copy standalone server + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema for db push
COPY --from=builder /app/prisma ./prisma

# Copy package.json for seed script
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Single command: push schema, seed, start
CMD sh -c "echo 'Pushing database schema...' && npx prisma db push --skip-generate --accept-data-loss && echo 'Seeding...' && node -e \"const{PrismaClient}=require('@prisma/client');const b=require('bcryptjs');const p=new PrismaClient();(async()=>{const h=b.hashSync('admin123',10);const m=b.hashSync('manager123',10);const t=b.hashSync('brennan2026',10);await p.user.upsert({where:{username:'system'},update:{},create:{username:'system',displayName:'System',email:'system@brennaninc.com',passwordHash:h,role:'admin'}});await p.user.upsert({where:{username:'admin'},update:{},create:{username:'admin',displayName:'Admin User',email:'admin@brennaninc.com',passwordHash:h,role:'admin'}});await p.user.upsert({where:{username:'jwood'},update:{},create:{username:'jwood',displayName:'J. Wood',email:'jwood@brennaninc.com',passwordHash:m,role:'rebate_manager'}});for(const[u,d]of[['scott','Scott'],['mark','Mark'],['dale','Dale'],['scrima','Scrima']]){await p.user.upsert({where:{username:u},update:{},create:{username:u,displayName:d,email:u+'@brennaninc.com',passwordHash:t,role:'rebate_manager'}})}for(const[c,n]of[['FAS','Fastenal'],['MOTION','Motion Industries'],['HSC','HSC Industrial Supply'],['AIT','AIT Supply'],['LGG','LGG Industrial'],['TIPCO','TIPCO Technologies']]){await p.distributor.upsert({where:{code:c},update:{},create:{code:c,name:n}})}for(const[c,n]of[['LINK-BELT','Link-Belt'],['CAT','Caterpillar'],['DEERE','John Deere'],['KOMATSU','Komatsu'],['VOLVO','Volvo'],['CASE','Case Construction'],['KUBOTA','Kubota'],['TEREX','Terex']]){await p.endUser.upsert({where:{code:c},update:{},create:{code:c,name:n}})}console.log('Seed complete.');await p.\$disconnect()})()\" && echo 'Starting server...' && node server.js"
