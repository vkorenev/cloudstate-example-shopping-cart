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
    console.log("addItem", addItem)
    // Validation:
    // Make sure that it is not possible to add negative quantities
    if (addItem.quantity < 1) {
        console.log("addItem:: quantity check failed")
        ctx.fail("Cannot add negative quantity to item " + addItem.productId)
        return {}
    } else {
        // Create the event.    
        const itemAdded = ItemAdded.create({
            item: {
                productId: addItem.productId,
                name: addItem.name,
                quantity: addItem.quantity
            }
        })
        // Emit the event.
        console.log("addItem::emit event", itemAdded)
        ctx.emit(itemAdded)
        return {}
    }
}

/**
 * Handler for remove item commands.
 */
function removeItem(removeItem: api.RemoveLineItem, cart: domain.Cart, ctx): Empty {
    console.log("removeItem", removeItem)
    // Validation:
    // Check that the item that we're removing actually exists.
    const existing = cart.items.find(item => {
        console.log("removeItem:: return existing")
        return item.productId === removeItem.productId
    })

    // If not, fail the command.
    if (!existing) {
        ctx.fail("Item " + removeItem.productId + " not in cart")
        return {}
    } else {
        // Otherwise, emit an item removed event.
        const itemRemoved = ItemRemoved.create({
            productId: removeItem.productId
        })
        ctx.emit(itemRemoved)
        return {}
    }
}

/**
 * Handler for get cart commands.
 */
function getCart(request: api.GetShoppingCart, cart: domain.Cart): api.Cart {
    console.log("getCart", cart)
    // Simply return the shopping cart as is.
    return cart
}

/**
 * Handler for item added events.
 */
function itemAdded(added: domain.ItemAdded, cart: domain.Cart): domain.Cart {
    console.log("itemAdded")

    const item = added.item!
    // If there is an existing item with that product id, we need to increment its quantity.
    const existing = cart.items.find(item => {
        console.log("itemAdded::return existing")
        return item.productId === item.productId
    })

    if (existing) {
        existing.quantity = existing.quantity! + item.quantity!
    } else {
        console.log("itemAdded::push")
        // Otherwise, we just add the item to the existing list.
        cart.items.push(item)
    }

    // And return the new state.
    console.log("return state")
    return cart
}

/**
 * Handler for item removed events.
 */
function itemRemoved(removed: domain.ItemRemoved, cart: domain.Cart): domain.Cart {
    // Filter the removed item from the items by product id.
    cart.items = cart.items.filter(item => {
        return item.productId !== removed.productId
    })

    // And return the new state.
    return cart
}
