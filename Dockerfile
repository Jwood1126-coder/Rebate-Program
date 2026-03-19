FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy Prisma client + schema
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/prisma ./prisma

# Copy built Next.js app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000

CMD sh -c "echo '--- DB PUSH ---' && npx prisma db push --skip-generate --accept-data-loss && echo '--- SEED ---' && node -e 'const{PrismaClient:P}=require(\"@prisma/client\"),b=require(\"bcryptjs\"),p=new P;(async()=>{const h=b.hashSync(\"admin123\",10),m=b.hashSync(\"manager123\",10),t=b.hashSync(\"brennan2026\",10);for(const[u,d,e,ph,r]of[[\"system\",\"System\",\"system\",h,\"admin\"],[\"admin\",\"Admin User\",\"admin\",h,\"admin\"],[\"jwood\",\"J. Wood\",\"jwood\",m,\"rebate_manager\"],[\"scott\",\"Scott\",\"scott\",t,\"rebate_manager\"],[\"mark\",\"Mark\",\"mark\",t,\"rebate_manager\"],[\"dale\",\"Dale\",\"dale\",t,\"rebate_manager\"],[\"scrima\",\"Scrima\",\"scrima\",t,\"rebate_manager\"]])await p.user.upsert({where:{username:u},update:{},create:{username:u,displayName:d,email:e+\"@brennaninc.com\",passwordHash:ph,role:r}});for(const[c,n]of[[\"FAS\",\"Fastenal\"],[\"MOTION\",\"Motion Industries\"],[\"HSC\",\"HSC Industrial Supply\"],[\"AIT\",\"AIT Supply\"],[\"LGG\",\"LGG Industrial\"],[\"TIPCO\",\"TIPCO Technologies\"]])await p.distributor.upsert({where:{code:c},update:{},create:{code:c,name:n}});for(const[c,n]of[[\"LINK-BELT\",\"Link-Belt\"],[\"CAT\",\"Caterpillar\"],[\"DEERE\",\"John Deere\"],[\"KOMATSU\",\"Komatsu\"],[\"VOLVO\",\"Volvo\"],[\"CASE\",\"Case Construction\"],[\"KUBOTA\",\"Kubota\"],[\"TEREX\",\"Terex\"]])await p.endUser.upsert({where:{code:c},update:{},create:{code:c,name:n}});console.log(\"Seed done\");await p.\$disconnect()})()' && echo '--- START ---' && npx next start"
