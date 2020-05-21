import { com } from '../build/proto/shoppingservice'
import { ShoppingCartService, CartStatus, LineItem } from './shoppingCart'
import { ProductInventoryService } from './productInventory'
const Stateless = require("cloudstate").Stateless;

const cloudstate = new Stateless(
    "proto/shoppingservice.proto",
    "com.example.shoppingservice.ShoppingService"
);

cloudstate.commandHandlers = {
    GetShoppingCart: getShoppingCart,
    ReserveCartItems: reserveCartItems,
    ConfirmOrder: confirmOrder,
    CancelOrder: cancelOrder
};

if (process.env.PORT) {
    cloudstate.start({ bindPort: process.env.PORT })
} else {
    cloudstate.start({});
}

const shoppingCartService = new ShoppingCartService
const productInventoryService = new ProductInventoryService

async function getInventory(lineItem: LineItem): Promise<com.example.shoppingservice.ILineItem> {
    const inventory = await productInventoryService.getAvailableProductInventory(lineItem.productId)
    return {
        productId: lineItem.productId,
        name: lineItem.name,
        quantity: lineItem.quantity,
        availableQuantity: inventory.quantity
    }
}

async function getShoppingCart(get: com.example.shoppingservice.GetCart): Promise<com.example.shoppingservice.ICart> {
    const cart = await shoppingCartService.getCart(get.userId)
    const items = await Promise.all(cart.itemsList.map(getInventory))
    return { items: items }
}

async function reserveCartItems(reserve: com.example.shoppingservice.Reserve): Promise<void> {
    const userId = reserve.userId

    const cart = await shoppingCartService.getCart(userId)
    if (cart.status != CartStatus.SHOPPING) {
        throw Error(`Invalid cart status '${cart.status}'`)
    }

    await shoppingCartService.setStatus(userId, CartStatus.RESERVING)
    console.log(`Reserving cart items for user '${userId}'`)

    const reservedProducts = Array<string>()
    for (let cartItem of cart.itemsList) {
        try {
            await productInventoryService.reserveProduct(userId, cartItem.productId, cartItem.quantity)
            console.log(`Item reserved for user '${userId}': `, cartItem)
            reservedProducts.push(cartItem.productId)
        } catch (error) {
            console.log(`Failed to reserve an item for user '${userId}':`, cartItem, error)

            for (let productId of reservedProducts) {
                await productInventoryService.cancelReservation(userId, productId)
                console.log(`Reservation was cancelled for user '${userId}':`, productId)
            }

            await shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
            console.log(`Status reverted back to 'shopping' for user '${userId}'`)

            throw error
        }
    }

    try {
        await shoppingCartService.setStatus(userId, CartStatus.WAITING_FOR_PAYMENT)
        console.log(`Waiting for payment from user '${userId}'`)
    } catch (error) {
        console.log(`Failed to change status for user '${userId}'`, error)

        for (let productId of reservedProducts) {
            await productInventoryService.cancelReservation(userId, productId)
            console.log(`Reservation was cancelled for user '${userId}':`, productId)
        }

        await shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
        console.log(`Status reverted back to 'shopping' for user '${userId}'`)

        throw error
    }
}

async function confirmOrder(confirm: com.example.shoppingservice.Confirm): Promise<void> {
    const userId = confirm.userId
    const cart = await shoppingCartService.getCart(userId)
    if (cart.status != CartStatus.WAITING_FOR_PAYMENT) {
        throw Error(`Invalid cart status '${cart.status}'`)
    }
    for (let cartItem of cart.itemsList) {
        const productId = cartItem.productId
        await productInventoryService.buyProduct(userId, productId)
    }
    await shoppingCartService.resetCartAfterPayment(userId)
}

async function cancelOrder(cancel: com.example.shoppingservice.Cancel): Promise<void> {
    const userId = cancel.userId
    const cart = await shoppingCartService.getCart(userId)
    if (cart.status != CartStatus.WAITING_FOR_PAYMENT) {
        throw Error(`Invalid cart status '${cart.status}'`)
    }
    for (let cartItem of cart.itemsList) {
        await productInventoryService.cancelReservation(userId, cartItem.productId)
    }
    await shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
}
