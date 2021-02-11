import { promisify } from 'util'
import { credentials, requestCallback } from 'grpc'
import { Empty } from 'google-protobuf/google/protobuf/empty_pb'
import {
    GetAvailable, Reserve, Cancel, Buy,
    AvailableInventory as AvailableInventoryPB
} from '../build/proto/inventory_pb'
import { ProductInventoryClient } from '../build/proto/inventory_grpc_pb'

export type AvailableInventory = AvailableInventoryPB.AsObject

export class ProductInventoryService {
    private clientAddress = process.env['PRODUCT_INVENTORY_CLIENT_ADDRESS'] || "inventory:80"
    private client = new ProductInventoryClient(this.clientAddress, credentials.createInsecure());

    private _reserveProduct = promisify(
        (argument: Reserve, callback: requestCallback<Empty>) =>
            this.client.reserveProduct(argument, callback)
    )
    reserveProduct = async (userId: string, productId: string, quantity: number): Promise<void> => {
        const reserveProduct = new Reserve();
        reserveProduct.setUserId(userId)
        reserveProduct.setProductId(productId)
        reserveProduct.setQuantity(quantity)

        await this._reserveProduct(reserveProduct)
    }

    private _cancelReservation = promisify(
        (argument: Cancel, callback: requestCallback<Empty>) =>
            this.client.cancelReservation(argument, callback)
    )
    cancelReservation = async (userId: string, productId: string): Promise<void> => {
        const cancelProduct = new Cancel();
        cancelProduct.setUserId(userId)
        cancelProduct.setProductId(productId)

        await this._cancelReservation(cancelProduct)
    }

    private _buyProduct = promisify(
        (argument: Buy, callback: requestCallback<Empty>) =>
            this.client.buyProduct(argument, callback)
    )
    buyProduct = async (userId: string, productId: string): Promise<void> => {
        const buyProduct = new Buy();
        buyProduct.setUserId(userId)
        buyProduct.setProductId(productId)

        await this._buyProduct(buyProduct)
    }

    private _getAvailableProductInventory = promisify(
        (argument: GetAvailable, callback: requestCallback<AvailableInventoryPB>) =>
            this.client.getAvailableProductInventory(argument, callback)
    )
    getAvailableProductInventory = async (productId: string): Promise<AvailableInventory> => {
        const get = new GetAvailable()
        get.setProductId(productId)

        const availableInventory = await this._getAvailableProductInventory(get)
        return availableInventory!.toObject()
    }
}
