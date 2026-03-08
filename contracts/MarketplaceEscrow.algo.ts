import { Contract } from '@algorandfoundation/tealscript';

/**
 * MarketplaceEscrow
 * 
 * Handles escrow for physical goods with a shipping/delivery flow.
 * 1. Buyer funds the contract (Price + Min Balance).
 * 2. Seller marks as Shipped.
 * 3. Buyer confirms receipt (funds released to seller).
 * 4. (Optional) Refund logic if not shipped within time.
 */
class MarketplaceEscrow extends Contract {
  // Global States
  seller = GlobalStateKey<Address>();
  buyer = GlobalStateKey<Address>();
  price = GlobalStateKey<uint64>();
  status = GlobalStateKey<uint64>(); // 0: Open, 1: Funded, 2: Shipped, 3: Completed, 4: Refunded

  /**
   * Initialize the escrow
   */
  createApplication(seller: Address, price: uint64): void {
    this.seller.value = seller;
    this.price.value = price;
    this.status.value = 0;
  }

  /**
   * Buyer funds the escrow
   */
  fund(): void {
    assert(this.status.value == 0);
    assert(this.txn.sender != this.seller.value); // Buyer cannot be seller
    
    verifyPayTxn(this.txnGroup[this.txn.groupIndex + 1], {
      receiver: this.app.address,
      amount: this.price.value + 100_000, // Price + Min balance for contract account
    });

    this.buyer.value = this.txn.sender;
    this.status.value = 1;
  }

  /**
   * Seller marks the item as shipped
   */
  markShipped(): void {
    assert(this.txn.sender == this.seller.value);
    assert(this.status.value == 1);
    this.status.value = 2;
  }

  /**
   * Buyer confirms receipt, releasing funds to seller
   */
  confirmReceipt(): void {
    assert(this.txn.sender == this.buyer.value);
    assert(this.status.value == 2);

    sendPayment({
      receiver: this.seller.value,
      amount: this.price.value,
      fee: 0, // Inner transaction fee covered by app call
    });

    this.status.value = 3;
  }

  /**
   * Buyer requests refund if seller doesn't ship or by mutual agreement
   * For simplicity, let's allow refund if status is FUNDED (not shipped yet)
   */
  requestRefund(): void {
    assert(this.txn.sender == this.buyer.value);
    assert(this.status.value == 1); // Only before shipping

    sendPayment({
      receiver: this.buyer.value,
      amount: this.price.value,
      fee: 0,
    });

    this.status.value = 4;
  }
}
