FROM node:18-alpine

WORKDIR /app

# Install dependencies for sharp
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Install dependencies with network retry
RUN npm install --production --network-timeout=100000

COPY . .

RUN mkdir -p uploads

EXPOSE 3007

CMD ["node", "index.js"]