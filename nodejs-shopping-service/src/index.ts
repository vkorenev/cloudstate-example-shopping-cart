//import { Stateless } from 'cloudstate'
const Stateless = require("cloudstate").Stateless;
import { ShoppingService } from './shoppingService'

const cloudstate = new Stateless(
    "proto/shoppingservice.proto",
    "com.example.shoppingservice.ShoppingService"
);

const shoppingService = new ShoppingService()

cloudstate.commandHandlers = {
    GetShoppingCart: shoppingService.getShoppingCart,
    ReserveCartItems: shoppingService.reserveCartItems,
    ConfirmOrder: shoppingService.confirmOrder,
    CancelOrder: shoppingService.cancelOrder
};

module.exports = cloudstate;

if (process.env.PORT) {
    cloudstate.start({ bindPort: process.env.PORT })
} else {
    cloudstate.start({});
}
