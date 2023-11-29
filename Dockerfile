FROM node:18.17.0

WORKDIR /app/medusa

COPY package.json .
COPY develop.sh .
COPY yarn.* .
COPY medusa-taxes-stripe .

RUN apt-get update

RUN apt-get install -y python3

RUN npm install -g npm@latest

RUN npm config set cache /tmp --global

RUN npm install -g @medusajs/medusa-cli@latest

RUN yarn install

COPY . .

ENTRYPOINT ["./develop.sh"]
