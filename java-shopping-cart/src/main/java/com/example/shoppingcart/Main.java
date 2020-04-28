package com.example.shoppingcart;

import io.cloudstate.javasupport.*;

public final class Main {
  public static final void main(String[] args) throws Exception {
    new CloudState()
        .registerEventSourcedEntity(
            ShoppingCartEntity.class,
            Shoppingcart.getDescriptor().findServiceByName("ShoppingCart"),
            com.example.shoppingcart.persistence.Domain.getDescriptor())
        .start()
        .toCompletableFuture()
        .get();
  }
}
