import { com, google } from '../build/proto/inventory'
const EventSourced = require("cloudstate").EventSourced
import api = com.example.inventory
import domain = com.example.inventory.persistence

type Empty = google.protobuf.IEmpty

const entity = new EventSourced(
    ["inventory.proto", "domain.proto"],
    "com.example.inventory.ProductInventory",
    {
        persistenceId: "inventory",
        snapshotEvery: 5, // Usually you wouldn't snapshot this frequently, but this helps to demonstrate snapshotting
        includeDirs: ["proto"]
    }
)

const ProductInventory = entity.lookupType(
    "com.example.inventory.persistence.ProductInventory"
) as typeof domain.ProductInventory

const AvailableInventoryChanged = entity.lookupType(
    "com.example.inventory.persistence.AvailableInventoryChanged"
) as typeof domain.AvailableInventoryChanged

const ProductReserved = entity.lookupType(
    "com.example.inventory.persistence.ProductReserved"
) as typeof domain.ProductReserved

const ProductReservationCancelled = entity.lookupType(
    "com.example.inventory.persistence.ProductReservationCancelled"
) as typeof domain.ProductReservationCancelled

const ProductBought = entity.lookupType(
    "com.example.inventory.persistence.ProductBought"
) as typeof domain.ProductBought

entity.setInitial((userId: string) => {
    console.log("Creating new entity with ID:", userId)
    return ProductInventory.create()
})

entity.setBehavior(inventory => {
    return {
        // Command handlers. The name of the command corresponds to the name of the rpc call in
        // the gRPC service that this entity offers.
        commandHandlers: {
            AddProductQuantity: addProductQuantity,
            RemoveProductQuantity: removeProductQuantity,
            ReserveProduct: reserveProduct,
            CancelReservation: cancelReservation,
            BuyProduct: buyProduct,
            GetAvailableProductInventory: getAvailableProductInventory,
        },
        // Event handlers. The name of the event corresponds to the (unqualified) name of the
        // persisted protobuf message.
        eventHandlers: {
            AvailableInventoryChanged: availableInventoryChanged,
            ProductReserved: productReserved,
            ProductReservationCancelled: productReservationCancelled,
            ProductBought: productBought
        }
    }
})

if (process.env.PORT) {
    entity.start({ bindPort: process.env.PORT })
} else {
    entity.start()
}

function addProductQuantity(add: api.Add, inventory: domain.ProductInventory, ctx): Empty {
    const addedQuantity = add.quantity
    if (addedQuantity <= 0) {
        ctx.fail("Cannot add non-positive quantity")
    }
    ctx.emit(AvailableInventoryChanged.create({
        quantity: addedQuantity
    }))
    return {}
}

function removeProductQuantity(remove: api.Remove, inventory: domain.ProductInventory, ctx): Empty {
    const removedQuantity = remove.quantity
    if (removedQuantity <= 0) {
        ctx.fail("Cannot remove non-positive quantity")
    }
    const available = inventory.available
    if (removedQuantity > available) {
        ctx.fail("Cannot remove more than " + available)
    }
    ctx.emit(AvailableInventoryChanged.create({
        quantity: -removedQuantity
    }))
    return {}
}

function reserveProduct(reserve: api.Reserve, inventory: domain.ProductInventory, ctx): Empty {
    const quantity = reserve.quantity
    if (quantity <= 0) {
        ctx.fail("Cannot reserve non-positive quantity")
    }
    const available = inventory.available
    if (quantity > available) {
        ctx.fail("Cannot reserve more than " + available)
    }
    const userId = reserve.userId
    if (inventory.reserved[userId]) {
        ctx.fail("Cannot reserve the same type of inventory for the same order twice")
    }
    ctx.emit(ProductReserved.create({
        userId: userId,
        quantity: quantity
    }))
    return {}
}

function cancelReservation(cancel: api.Cancel, inventory: domain.ProductInventory, ctx): Empty {
    const userId = cancel.userId
    if (inventory.reserved[userId] == null) {
        ctx.fail("Unknown order to cancel")
    }
    ctx.emit(ProductReservationCancelled.create({
        userId: userId
    }))
    return {}
}

function buyProduct(buy: api.Buy, inventory: domain.ProductInventory, ctx): Empty {
    const userId = buy.userId
    if (inventory.reserved[userId] == null) {
        ctx.fail("Unknown order to confirm")
    }
    ctx.emit(ProductBought.create({
        userId: userId
    }))
    return {}
}

function getAvailableProductInventory(get: api.GetAvailable, inventory: domain.ProductInventory): api.IAvailableInventory {
    return {
        quantity: inventory.available
    }
}

function availableInventoryChanged(changed: domain.AvailableInventoryChanged, inventory: domain.ProductInventory): domain.IProductInventory {
    const quantity = changed.quantity
    inventory.available = inventory.available + quantity
    return inventory
}

function productReserved(reserved: domain.ProductReserved, inventory: domain.ProductInventory): domain.IProductInventory {
    const userId = reserved.userId
    const quantity = reserved.quantity
    inventory.available = inventory.available - quantity
    inventory.reserved[userId] = quantity
    return inventory
}

function productReservationCancelled(cancelled: domain.ProductReservationCancelled, inventory: domain.ProductInventory): domain.IProductInventory {
    const userId = cancelled.userId
    const quantity = inventory.reserved[userId]
    if (quantity) {
        delete inventory.reserved[userId]
        inventory.available = inventory.available + quantity
    }
    return inventory
}

function productBought(bought: domain.ProductBought, inventory: domain.ProductInventory): domain.IProductInventory {
    const userId = bought.userId
    delete inventory.reserved[userId]
    return inventory
}
