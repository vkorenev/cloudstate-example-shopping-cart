package com.example.shoppingcart;

import com.example.shoppingcart.persistence.Domain;
import com.google.protobuf.Empty;
import io.cloudstate.javasupport.EntityId;
import io.cloudstate.javasupport.eventsourced.*;

import java.util.*;
import java.util.stream.Collectors;

/** An event sourced entity. */
@EventSourcedEntity
public class ShoppingCartEntity {
  private final String entityId;
  private final Map<String, Domain.LineItem> cart = new LinkedHashMap<>();
  private Domain.Cart.Status status = Domain.Cart.Status.SHOPPING;

  public ShoppingCartEntity(@EntityId String entityId) {
    this.entityId = entityId;
  }

  @Snapshot
  public Domain.Cart snapshot() {
    return Domain.Cart.newBuilder()
        .addAllItems(cart.values())
        .setStatus(status)
        .build();
  }

  @SnapshotHandler
  public void handleSnapshot(Domain.Cart cart) {
    this.cart.clear();
    for (Domain.LineItem item : cart.getItemsList()) {
      this.cart.put(item.getProductId(), item);
    }
    status = cart.getStatus();
  }

  @EventHandler
  public void itemAdded(Domain.ItemAdded itemAdded) {
    Domain.LineItem item = cart.get(itemAdded.getItem().getProductId());
    if (item == null) {
      item = itemAdded.getItem();
    } else {
      item =
          item.toBuilder()
              .setQuantity(item.getQuantity() + itemAdded.getItem().getQuantity())
              .build();
    }
    cart.put(item.getProductId(), item);
  }

  @EventHandler
  public void itemRemoved(Domain.ItemRemoved itemRemoved) {
    cart.remove(itemRemoved.getProductId());
  }

  @EventHandler
  public void statusChanged(Domain.CartStatusChanged statusChanged) {
    status = statusChanged.getStatus();
  }

  @CommandHandler
  public Shoppingcart.Cart getCart() {
    return Shoppingcart.Cart.newBuilder()
        .setStatus(convert(status))
        .addAllItems(cart.values().stream().map(this::convert).collect(Collectors.toList())).build();
  }

  @CommandHandler
  public Empty addItem(Shoppingcart.AddLineItem item, CommandContext ctx) {
    if (status != Domain.Cart.Status.SHOPPING) {
      ctx.fail("Cannot add items when status is " + status);
    }
    if (item.getQuantity() <= 0) {
      ctx.fail("Cannot add negative quantity of to item " + item.getProductId());
    }
    ctx.emit(
        Domain.ItemAdded.newBuilder()
            .setItem(
                Domain.LineItem.newBuilder()
                    .setProductId(item.getProductId())
                    .setName(item.getName())
                    .setQuantity(item.getQuantity())
                    .build())
            .build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty removeItem(Shoppingcart.RemoveLineItem item, CommandContext ctx) {
    if (status != Domain.Cart.Status.SHOPPING) {
      ctx.fail("Cannot remove items when status is " + status);
    }
    if (!cart.containsKey(item.getProductId())) {
      ctx.fail("Cannot remove item " + item.getProductId() + " because it is not in the cart.");
    }
    ctx.emit(Domain.ItemRemoved.newBuilder().setProductId(item.getProductId()).build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty setStatus(Shoppingcart.SetCartStatus setCartStatus, CommandContext ctx) {
    Domain.Cart.Status newStatus = convert(setCartStatus.getStatus());
    if (status != newStatus) {
      if (status == Domain.Cart.Status.SHOPPING && newStatus == Domain.Cart.Status.WAITING_FOR_PAYMENT) {
        ctx.fail("Invalid state change");
      }
      ctx.emit(Domain.CartStatusChanged.newBuilder().setStatus(newStatus).build());
    }
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty resetCartAfterPayment(Shoppingcart.ResetShoppingCart reset, CommandContext ctx) {
    if (status != Domain.Cart.Status.WAITING_FOR_PAYMENT) {
      ctx.fail("Cart is not in 'waiting for payment' state");
    }
    var productIds = cart.keySet().toArray(new String[0]);
    for (String productId : productIds) {
      ctx.emit(Domain.ItemRemoved.newBuilder().setProductId(productId).build());
    }
    ctx.emit(Domain.CartStatusChanged.newBuilder().setStatus(Domain.Cart.Status.SHOPPING).build());
    return Empty.getDefaultInstance();
  }

  private Shoppingcart.LineItem convert(Domain.LineItem item) {
    return Shoppingcart.LineItem.newBuilder()
        .setProductId(item.getProductId())
        .setName(item.getName())
        .setQuantity(item.getQuantity())
        .build();
  }

  private Shoppingcart.Cart.Status convert(Domain.Cart.Status status) {
    switch (status) {
      case SHOPPING:
        return Shoppingcart.Cart.Status.SHOPPING;
      case RESERVING:
        return Shoppingcart.Cart.Status.RESERVING;
      case WAITING_FOR_PAYMENT:
        return Shoppingcart.Cart.Status.WAITING_FOR_PAYMENT;
      default:
        return Shoppingcart.Cart.Status.UNRECOGNIZED;
    }
  }

  private Domain.Cart.Status convert(Shoppingcart.Cart.Status status) {
    switch (status) {
      case SHOPPING:
        return Domain.Cart.Status.SHOPPING;
      case RESERVING:
        return Domain.Cart.Status.RESERVING;
      case WAITING_FOR_PAYMENT:
        return Domain.Cart.Status.WAITING_FOR_PAYMENT;
      default:
        return Domain.Cart.Status.UNRECOGNIZED;
    }
  }
}
