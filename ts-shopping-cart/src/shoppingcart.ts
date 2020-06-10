import { com, google } from '../build/proto/shoppingcart'
const EventSourced = require("cloudstate").EventSourced
import api = com.example.shoppingcart
import domain = com.example.shoppingcart.persistence

type Empty = google.protobuf.IEmpty

export const entity = new EventSourced(
    ["shoppingcart.proto", "domain.proto"],
    "com.example.shoppingcart.ShoppingCart",
    {
        persistenceId: "shopping-cart",
        snapshotEvery: 5, // Usually you wouldn't snapshot this frequently, but this helps to demonstrate snapshotting
        includeDirs: ["proto"]
    }
)

/*
 * Here we load the Protobuf types. When emitting events or setting state, we need to return
 * protobuf message objects, not just ordinary JavaScript objects, so that the framework can
 * know how to serialize these objects when they are persisted.
 *
 * Note this shows loading them dynamically, they could also be compiled and statically loaded.
 */
const pkg = "com.example.shoppingcart.persistence."
const ItemAdded = entity.lookupType(pkg + "ItemAdded") as typeof domain.ItemAdded
const ItemRemoved = entity.lookupType(pkg + "ItemRemoved") as typeof domain.ItemRemoved
const Cart = entity.lookupType(pkg + "Cart") as typeof domain.Cart

/*
 * Set a callback to create the initial state. This is what is created if there is no
 * snapshot to load.
 *
 * We can ignore the userId parameter if we want, it's the id of the entity, which is
 * automatically associated with all events and state for this entity.
 */
entity.setInitial((userId: string) => Cart.create())

/*
 * Set a callback to create the behavior given the current state. Since there is no state
 * machine like behavior transitions for our shopping cart, we just return one behavior, but
 * this could inspect the cart, and return a different set of handlers depending on the
 * current state of the cart - for example, if the cart supported being checked out, then
 * if the cart was checked out, it might return AddItem and RemoveItem command handlers that
 * always fail because the cart is checked out.
 *
 * This callback will be invoked after each time that an event is handled to get the current
 * behavior for the current state.
 */
entity.setBehavior((cart: domain.Cart) => {
    return {
        // Command handlers. The name of the command corresponds to the name of the rpc call in
        // the gRPC service that this entity offers.
        commandHandlers: {
            AddItem: addItem,
            RemoveItem: removeItem,
            GetCart: getCart
        },
        // Event handlers. The name of the event corresponds to the (unqualified) name of the
        // persisted protobuf message.
        eventHandlers: {
            ItemAdded: itemAdded,
            ItemRemoved: itemRemoved
        }
    }
})

/**
 * Handler for add item commands.
 */
function addItem(addItem: api.AddLineItem, cart: domain.Cart, ctx): Empty {
    console.log("Add item", addItem)

    // Validation:
    // Make sure that it is not possible to add negative quantities
    if (addItem.quantity < 1) {
        ctx.fail("Cannot add negative quantity to item " + addItem.productId)
        return {}
    } else {
        // Emit the event.
        ctx.emit(ItemAdded.create({
            productId: addItem.productId,
            name: addItem.name,
            quantity: addItem.quantity
        }))
        return {}
    }
}

/**
 * Handler for remove item commands.
 */
function removeItem(removeItem: api.RemoveLineItem, cart: domain.Cart, ctx): Empty {
    console.log("Remove item", removeItem)

    // Validation:
    // Check that the item that we're removing actually exists.
    const existing = cart.items[removeItem.productId]

    // If not, fail the command.
    if (existing) {
        // Otherwise, emit an item removed event.
        ctx.emit(ItemRemoved.create({
            productId: removeItem.productId
        }))
        return {}
    } else {
        ctx.fail(`Item ${removeItem.productId} not in cart`)
        return {}
    }
}

/**
 * Handler for get cart commands.
 */
function getCart(request: api.GetShoppingCart, cart: domain.Cart): api.ICart {
    console.log("Get cart", request)

    const items = Object.entries(cart.items).map(([productId, lineItem]) => {
        return {
            productId: productId,
            name: lineItem.name,
            quantity: lineItem.quantity
        }
    })

    console.log("Cart items", items)

    return {
        items: items
    }
}

/**
 * Handler for item added events.
 */
function itemAdded(added: domain.ItemAdded, cart: domain.Cart): domain.ICart {
    // If there is an existing item with that product id, we need to increment its quantity.
    const existing = cart.items[added.productId]

    if (existing) {
        console.log("Existing item added", added)
        existing.quantity = existing.quantity! + added.quantity
    } else {
        console.log("New item added", added)
        // Otherwise, we just add the item to the existing list.
        cart.items[added.productId] = {
            name: added.name,
            quantity: added.quantity
        }
    }

    // And return the new state.
    console.log("Updated cart", cart)
    return cart
}

/**
 * Handler for item removed events.
 */
function itemRemoved(removed: domain.ItemRemoved, cart: domain.Cart): domain.ICart {
    console.log("Item removed", removed)

    // Delete the removed item from the items by product id.
    delete cart.items[removed.productId]

    // And return the new state.
    console.log("Updated cart", cart)
    return cart
}
