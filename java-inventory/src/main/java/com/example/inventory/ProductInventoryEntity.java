package com.example.inventory;

import com.example.inventory.persistence.Domain;
import com.google.protobuf.Empty;
import io.cloudstate.javasupport.EntityId;
import io.cloudstate.javasupport.eventsourced.*;

import java.util.HashMap;
import java.util.Map;

/**
 * An event sourced entity.
 */
@EventSourcedEntity
public class ProductInventoryEntity {
  private final String productId;
  private int available = 0;
  private final Map<String, Integer> reserved = new HashMap<>();

  public ProductInventoryEntity(@EntityId String productId) {
    this.productId = productId;
  }

  @Snapshot
  public Domain.ProductInventory snapshot() {
    return Domain.ProductInventory.newBuilder()
        .setAvailable(available)
        .putAllReserved(reserved)
        .build();
  }

  @SnapshotHandler
  public void handleSnapshot(Domain.ProductInventory inventory) {
    available = inventory.getAvailable();
    reserved.clear();
    reserved.putAll(inventory.getReservedMap());
  }

  @EventHandler
  public void inventoryChanged(Domain.AvailableInventoryChanged inventoryChanged) {
    available += inventoryChanged.getQuantity();
  }

  @EventHandler
  public void inventoryReservedForOrder(Domain.ProductReserved inventoryReserved) {
    int quantity = inventoryReserved.getQuantity();
    available -= quantity;
    reserved.put(inventoryReserved.getUserId(), quantity);
  }

  @EventHandler
  public void orderCancelled(Domain.ProductReservationCancelled orderCancelled) {
    var quantity = reserved.remove(orderCancelled.getUserId());
    if (quantity != null) {
      available += quantity;
    }
  }

  @EventHandler
  public void orderConfirmed(Domain.ProductBought orderConfirmed) {
    reserved.remove(orderConfirmed.getUserId());
  }


  @CommandHandler
  public Empty addProductQuantity(Inventory.Add command, CommandContext ctx) {
    int addedQuantity = command.getQuantity();
    if (addedQuantity <= 0) {
      ctx.fail("Cannot add non-positive quantity");
    }
    ctx.emit(Domain.AvailableInventoryChanged.newBuilder().setQuantity(addedQuantity).build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty removeProductQuantity(Inventory.Remove command, CommandContext ctx) {
    int removedQuantity = command.getQuantity();
    if (removedQuantity <= 0) {
      ctx.fail("Cannot remove non-positive quantity");
    }
    if (removedQuantity > available) {
      ctx.fail("Cannot remove more than " + available);
    }
    ctx.emit(Domain.AvailableInventoryChanged.newBuilder().setQuantity(-removedQuantity).build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty reserveProduct(Inventory.Reserve command, CommandContext ctx) {
    int quantity = command.getQuantity();
    if (quantity <= 0) {
      ctx.fail("Cannot reserve non-positive quantity");
    }
    if (quantity > available) {
      ctx.fail("Cannot reserve more than " + available);
    }
    var userId = command.getUserId();
    if (reserved.containsKey(userId)) {
      ctx.fail("Cannot reserve the same type of inventory for the same order twice");
    }
    ctx.emit(Domain.ProductReserved.newBuilder()
        .setUserId(userId)
        .setQuantity(quantity)
        .build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty cancelReservation(Inventory.Cancel command, CommandContext ctx) {
    var userId = command.getUserId();
    if (!reserved.containsKey(userId)) {
      ctx.fail("Unknown order to cancel");
    }
    ctx.emit(Domain.ProductReservationCancelled.newBuilder()
        .setUserId(userId)
        .build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Empty buyProduct(Inventory.Buy command, CommandContext ctx) {
    var userId = command.getUserId();
    if (!reserved.containsKey(userId)) {
      ctx.fail("Unknown order to confirm");
    }
    ctx.emit(Domain.ProductBought.newBuilder()
        .setUserId(userId)
        .build());
    return Empty.getDefaultInstance();
  }

  @CommandHandler
  public Inventory.AvailableInventory getAvailableProductInventory() {
    return Inventory.AvailableInventory.newBuilder()
        .setQuantity(available)
        .build();
  }
}
