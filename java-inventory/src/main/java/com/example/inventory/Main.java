package com.example.inventory;

import com.example.inventory.persistence.Domain;
import io.cloudstate.javasupport.CloudState;

public final class Main {
  public static void main(String[] args) throws Exception {
    new CloudState()
        .registerEventSourcedEntity(
            ProductInventoryEntity.class,
            Inventory.getDescriptor().findServiceByName("ProductInventory"),
            Domain.getDescriptor())
        .start()
        .toCompletableFuture()
        .get();
  }
}
