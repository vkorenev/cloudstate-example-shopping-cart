import { com } from '../build/proto/shoppingservice'
import { ShoppingCartService, CartStatus, LineItem } from './shoppingCart'
import { ProductInventoryService } from './productInventory'

export class ShoppingService {
    private shoppingCartService = new ShoppingCartService
    private productInventoryService = new ProductInventoryService

    private getInventory = async (lineItem: LineItem): Promise<com.example.shoppingservice.ILineItem> => {
        const inventory = await this.productInventoryService.getAvailableProductInventory(lineItem.productId)
        return {
            productId: lineItem.productId,
            name: lineItem.name,
            quantity: lineItem.quantity,
            availableQuantity: inventory.quantity
        }
    }

    getShoppingCart = async (get: com.example.shoppingservice.GetCart): Promise<com.example.shoppingservice.ICart> => {
        const cart = await this.shoppingCartService.getCart(get.userId)
        const items = await Promise.all(cart.itemsList.map(this.getInventory))
        return { items: items }
    }

    reserveCartItems = async (reserve: com.example.shoppingservice.Reserve): Promise<void> => {
        const userId = reserve.userId

        const cart = await this.shoppingCartService.getCart(userId)
        if (cart.status != CartStatus.SHOPPING) {
            throw Error(`Invalid cart status '${cart.status}'`)
        }

        await this.shoppingCartService.setStatus(userId, CartStatus.RESERVING)
        console.log(`Reserving cart items for user '${userId}'`)

        const reservedProducts = Array<string>()
        for (let cartItem of cart.itemsList) {
            try {
                await this.productInventoryService.reserveProduct(userId, cartItem.productId, cartItem.quantity)
                console.log(`Item reserved for user '${userId}': `, cartItem)
                reservedProducts.push(cartItem.productId)
            } catch (error) {
                console.log(`Failed to reserve an item for user '${userId}':`, cartItem, error)

                for (let productId of reservedProducts) {
                    await this.productInventoryService.cancelReservation(userId, productId)
                    console.log(`Reservation was cancelled for user '${userId}':`, productId)
                }

                await this.shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
                console.log(`Status reverted back to 'shopping' for user '${userId}'`)

                throw error
            }
        }

        try {
            await this.shoppingCartService.setStatus(userId, CartStatus.WAITING_FOR_PAYMENT)
            console.log(`Waiting for payment from user '${userId}'`)
        } catch (error) {
            console.log(`Failed to change status for user '${userId}'`, error)

            for (let productId of reservedProducts) {
                await this.productInventoryService.cancelReservation(userId, productId)
                console.log(`Reservation was cancelled for user '${userId}':`, productId)
            }

            await this.shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
            console.log(`Status reverted back to 'shopping' for user '${userId}'`)

            throw error
        }
    }

    confirmOrder = async (confirm: com.example.shoppingservice.Confirm): Promise<void> => {
        const userId = confirm.userId
        const cart = await this.shoppingCartService.getCart(userId)
        if (cart.status != CartStatus.WAITING_FOR_PAYMENT) {
            throw Error(`Invalid cart status '${cart.status}'`)
        }
        for (let cartItem of cart.itemsList) {
            const productId = cartItem.productId
            await this.productInventoryService.buyProduct(userId, productId)
        }
        await this.shoppingCartService.resetCartAfterPayment(userId)
    }

    cancelOrder = async (cancel: com.example.shoppingservice.Cancel): Promise<void> => {
        const userId = cancel.userId
        const cart = await this.shoppingCartService.getCart(userId)
        if (cart.status != CartStatus.WAITING_FOR_PAYMENT) {
            throw Error(`Invalid cart status '${cart.status}'`)
        }
        for (let cartItem of cart.itemsList) {
            await this.productInventoryService.cancelReservation(userId, cartItem.productId)
        }
        await this.shoppingCartService.setStatus(userId, CartStatus.SHOPPING)
    }
}

export default ShoppingService
