import { entity } from './shoppingcart'

const CloudState = require("cloudstate").CloudState;

const server = new CloudState();
server.addEntity(entity);

if (process.env.PORT) {
    server.start({ bindPort: process.env.PORT })
} else {
    server.start()
}
