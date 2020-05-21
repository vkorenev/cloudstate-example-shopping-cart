import { promisify } from 'util'
import { credentials, requestCallback } from 'grpc'
import { Empty } from 'google-protobuf/google/protobuf/empty_pb'
import {
    AddLineItem, RemoveLineItem, SetCartStatus, ResetShoppingCart, GetShoppingCart,
    Cart as CartPB,
    LineItem as LineItemPB
} from '../build/proto/shoppingcart_pb'
import { ShoppingCartClient } from '../build/proto/shoppingcart_grpc_pb'

export type Cart = CartPB.AsObject
export type CartStatus = CartPB.StatusMap[keyof CartPB.StatusMap]
export const CartStatus = CartPB.Status
export type LineItem = LineItemPB.AsObject

export class ShoppingCartService {
    private clientAddress = process.env['SHOPPING_CART_CLIENT_ADDRESS'] || "shopping-cart:80"
    private client = new ShoppingCartClient(this.clientAddress, credentials.createInsecure());
    private _addItem = promisify(
        (argument: AddLineItem, callback: requestCallback<Empty>) =>
            this.client.addItem(argument, callback)
    )
    addItem = async (userId: string, productId: string, name: string, quantity: number): Promise<void> => {
        const addLineItem = new AddLineItem()
        addLineItem.setUserId(userId)
        addLineItem.setProductId(productId)
        addLineItem.setName(name)
        addLineItem.setQuantity(quantity)

        await this._addItem(addLineItem)
    }

    private _removeItem = promisify(
        (argument: RemoveLineItem, callback: requestCallback<Empty>) =>
            this.client.removeItem(argument, callback)
    )
    removeItem = async (userId: string, productId: string): Promise<void> => {
        const removeLineItem = new RemoveLineItem()
        removeLineItem.setUserId(userId)
        removeLineItem.setProductId(productId)

        await this._removeItem(removeLineItem)
    }

    private _setStatus = promisify(
        (argument: SetCartStatus, callback: requestCallback<Empty>) =>
            this.client.setStatus(argument, callback)

    )
    setStatus = async (userId: string, status: CartStatus): Promise<void> => {
        const setStatus = new SetCartStatus()
        setStatus.setUserId(userId)
        setStatus.setStatus(status)

        await this._setStatus(setStatus)
    }

    private _resetCartAfterPayment = promisify(
        (argument: ResetShoppingCart, callback: requestCallback<Empty>) =>
            this.client.resetCartAfterPayment(argument, callback)
    )
    resetCartAfterPayment = async (userId: string): Promise<void> => {
        const resetShoppingCart = new ResetShoppingCart()
        resetShoppingCart.setUserId(userId)

        await this._resetCartAfterPayment(resetShoppingCart)
    }

    private _getCart = promisify(
        (argument: GetShoppingCart, callback: requestCallback<CartPB>) =>
            this.client.getCart(argument, callback)
    )
    getCart = async (userId: string): Promise<Cart> => {
        const get = new GetShoppingCart()
        get.setUserId(userId)

        const cart = await this._getCart(get)
        return cart!.toObject()
    }
}
