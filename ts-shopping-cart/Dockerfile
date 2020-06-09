FROM node:12.16.3-buster-slim

# Run as an unprivileged user
WORKDIR /home/node
USER node

# Install app dependencies
COPY package*.json ./
# The next line is needed to patch Cloudstate node support library
# TODO Remove when upstream is fixed
COPY patches patches/
RUN npm install --production

# Copy app
COPY . .

# Run
EXPOSE 8080
CMD ["npm", "start"]
