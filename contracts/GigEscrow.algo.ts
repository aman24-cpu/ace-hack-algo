import { Contract } from '@algorandfoundation/tealscript';

export class GigEscrow extends Contract {
  creator = GlobalStateKey<Address>();
  worker = GlobalStateKey<Address>();
  reward = GlobalStateKey<uint64>();
  status = GlobalStateKey<uint64>();
  worker_rating = GlobalStateKey<uint64>();

  // Status mapping:
  // 0: Open
  // 1: Claimed
  // 2: Completed

  createApplication(creator: Address, reward: uint64): void {
    this.creator.value = creator;
    this.reward.value = reward;
    this.status.value = 0;
    this.worker_rating.value = 0;
  }

  // The creator funds the escrow
  // Note: the creator sends a simple pay transaction to the contract address,
  // which can be done without calling a specific method if not needed,
  // but we can have an explicit fund method.
  fund(payment: PayTxn): void {
    assert(payment.amount >= this.reward.value);
    assert(payment.receiver === this.app.address);
    assert(this.txn.sender === this.creator.value);
  }

  claim(worker: Address): void {
    assert(this.status.value === 0);
    this.worker.value = worker;
    this.status.value = 1;
  }

  /**
   * Approve a payout. Can be a partial amount for milestones.
   * If the full amount is paid, the status becomes Completed.
   */
  approve(payout_amount: uint64, rating: uint64): void {
    assert(this.status.value === 1);
    assert(this.txn.sender === this.creator.value);
    assert(payout_amount <= this.reward.value);
    
    // Pay the worker
    sendPayment({
      receiver: this.worker.value,
      amount: payout_amount,
      fee: 0,
    });
    
    if (rating > 0) {
        this.worker_rating.value = rating;
    }

    if (payout_amount == this.reward.value) {
        this.status.value = 2;
    }
  }

  /**
   * Add a comment to the gig using Box Storage.
   * Box name is "comment" + sender address.
   */
  addComment(comment: string): void {
    const boxName = concat("comment", this.txn.sender);
    this.app.box(boxName).value = <StaticArray<byte, 64>>comment;
  }
}
