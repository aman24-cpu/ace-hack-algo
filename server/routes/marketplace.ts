import express from "express";
import { randomUUID } from "crypto";
import algosdk from "algosdk";
import { db } from "../db/database";
import { algodClient, safeGetAddress } from "../utils/algorand";

const router = express.Router();

router.get("/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC").all();
  res.json(products);
});

router.get("/top-sellers", async (req, res) => {
  const INDEXER_SERVER = "https://testnet-idx.algonode.cloud";
  try {
    // Search for transactions with some volume (using a generic search for now as the notes are new)
    // In a real app we'd search specifically for transactions with our note prefix
    const response = await fetch(`${INDEXER_SERVER}/v2/transactions?limit=100&tx-type=pay&min-amount=1000000`);
    if (!response.ok) return res.json([]);
    const data = await response.json();
    
    const sellers: Record<string, number> = {};
    data.transactions.forEach((tx: any) => {
      const receiver = tx["payment-transaction"]?.receiver;
      if (receiver) {
        sellers[receiver] = (sellers[receiver] || 0) + (tx["payment-transaction"]?.amount || 0);
      }
    });

    const sortedSellers = Object.entries(sellers)
      .map(([address, volume]) => ({ address, volume: volume / 1_000_000 }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5);

    res.json(sortedSellers);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch top sellers" });
  }
});

router.post("/products", (req, res) => {
  const { name, description, price, seller_address, image_url, category, quantity, is_auction, starting_price, auction_end, app_id } = req.body;
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category, quantity, is_auction, starting_price, auction_end, app_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, description, price, seller_address, image_url, category, quantity || 1, is_auction ? 1 : 0, starting_price, auction_end, app_id);
    res.json({ id, status: "success" });
  } catch (error) {
    console.error("Failed to create product:", error);
    res.status(500).json({ error: "Failed to create product" });
  }
});

router.get("/my-listings/:address", (req, res) => {
  const listings = db.prepare("SELECT * FROM products WHERE seller_address = ? ORDER BY created_at DESC").all(req.params.address);
  res.json(listings);
});

router.get("/my-orders/:address", (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, p.name as product_name, p.image_url 
    FROM orders o 
    JOIN products p ON o.product_id = p.id 
    WHERE o.buyer_address = ? OR o.seller_address = ?
    ORDER BY o.created_at DESC
  `).all(req.params.address, req.params.address);
  res.json(orders);
});

router.post("/orders", async (req, res) => {
  const { product_id, buyer_address, seller_address, amount, tx_id, quantity, currency } = req.body;
  const id = randomUUID();
  const purchaseQuantity = parseInt(quantity as string) || 1;
  const paymentCurrency = currency || "ALGO";

  console.log(`\n🔔 [BLOCKCHAIN-CHECK] Verification Start: ${tx_id}`);

  try {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(product_id) as any;
    if (!product) throw new Error("Product not found");
    if (product.quantity < purchaseQuantity) throw new Error("Not enough stock available");

    console.log("   - Waiting for confirmation...");
    await algosdk.waitForConfirmation(algodClient, tx_id, 4);
    
    const txInfo = (await algodClient.pendingTransactionInformation(tx_id).do()) as any;
    
    // THE ULTIMATE FINDER (Recursive & Intelligent)
    const find = (obj: any, keys: string[], path = ""): any => {
      if (!obj || typeof obj !== 'object') return undefined;
      
      // 1. Direct check
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== 0 && obj[k] !== "0") return obj[k];
      }
      
      // 2. Smart Recursion (prioritize txn objects)
      const priority = ['txn', 'assetTransfer', 'payment', 'asset-transfer-transaction', 'payment-transaction'];
      for (const p of priority) {
        if (obj[p]) {
          const res = find(obj[p], keys, `${path}.${p}`);
          if (res !== undefined) return res;
        }
      }

      // 3. Global Crawl
      for (const key in obj) {
        if (priority.includes(key)) continue; // Already checked
        if (typeof obj[key] === 'object') {
          const res = find(obj[key], keys, `${path}.${key}`);
          if (res !== undefined) return res;
        }
      }
      return undefined;
    };

    const type = find(txInfo, ['type', 'ty', 'tx-type'])?.toString().toLowerCase() || "unknown";
    const sender = safeGetAddress(find(txInfo, ['snd', 'sender', 'from']));

    const expectedAmount = BigInt(Math.round(Number(amount) * purchaseQuantity * 1_000_000));
    const USDC_ASSET_ID = 10458941;

    let receiver: string | null = null;
    let actualAmount: bigint = 0n;
    let actualAssetId: number | null = null;

    if (paymentCurrency === "USDC") {
      receiver = safeGetAddress(find(txInfo, ['receiver', 'arcv', 'to', 'rcv']));
      actualAmount = BigInt(find(txInfo, ['amount', 'aamt', 'asset-amount']) || 0);
      actualAssetId = Number(find(txInfo, ['assetIndex', 'xaid', 'asset-id', 'id']) || 0);
    } else {
      receiver = safeGetAddress(find(txInfo, ['rcv', 'receiver', 'to']));
      actualAmount = BigInt(find(txInfo, ['amt', 'amount']) || 0);
      actualAssetId = 0;
    }

    const isCorrectSender = sender === buyer_address;
    const isCorrectReceiver = receiver === seller_address;
    const isCorrectAmount = (actualAmount === expectedAmount);
    const isCorrectAsset = (paymentCurrency === "USDC") ? (actualAssetId === USDC_ASSET_ID) : true;

    console.log(`   - DATA: Amt=${actualAmount}, Asset=${actualAssetId}, Type=${type}`);
    console.log(`   - MATCH: Amt=${isCorrectAmount}, Asset=${isCorrectAsset}, Recv=${isCorrectReceiver}, Snd=${isCorrectSender}`);

    if (!isCorrectSender || !isCorrectReceiver || !isCorrectAmount || !isCorrectAsset) {
      console.warn("❌ [BLOCKCHAIN-CHECK] Mismatch Failure!");
      return res.status(400).json({ 
        error: "On-chain transaction verification failed. Details mismatch.",
        details: {
          type,
          sender: sender || "NOT_FOUND",
          receiver: receiver || "NOT_FOUND", 
          actualAmount: actualAmount.toString(), 
          expectedAmount: expectedAmount.toString(), 
          assetMatch: isCorrectAsset,
          actualAssetId,
          isCorrectSender,
          isCorrectReceiver,
          isCorrectAmount
        }
      });
    }

    console.log("✅ [VERIFY] Transaction verified successfully. Committing to DB...");

    db.transaction(() => {
      db.prepare("INSERT INTO orders (id, product_id, buyer_address, seller_address, amount, quantity, tx_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'paid')")
        .run(id, product_id, buyer_address, seller_address, amount, purchaseQuantity, tx_id);
      db.prepare("UPDATE products SET quantity = MAX(0, quantity - ?) WHERE id = ?").run(purchaseQuantity, product_id);
      db.prepare("UPDATE products SET status = 'sold' WHERE id = ? AND quantity <= 0").run(product_id);
    })();

    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("💥 [VERIFY] Verification CRASHED:", error);
    res.status(500).json({ error: error.message || "Failed to process order" });
  }
});

router.post("/orders/:id/ship", (req, res) => {
  const { id } = req.params;
  const { address } = req.body;
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order || order.seller_address !== address) return res.status(403).json({ error: "Unauthorized" });
    
    db.prepare("UPDATE orders SET shipment_status = 'shipped' WHERE id = ?").run(id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to update shipment" });
  }
});

router.post("/products/:id/bid", async (req, res) => {
  const { id } = req.params;
  const { bidder_address, amount, tx_id } = req.body;
  
  try {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
    if (!product || !product.is_auction) return res.status(404).json({ error: "Auction not found" });
    
    if (product.app_id && tx_id) {
      console.log(`🔍 [AUCTION-CHECK] Verifying bid tx: ${tx_id}`);
      await algosdk.waitForConfirmation(algodClient, tx_id, 4);
    }

    const currentBid = product.starting_price || 0;
    if (amount <= currentBid) {
      return res.status(400).json({ error: `Bid must be higher than current highest bid (${currentBid} ALGO)` });
    }
    
    db.prepare("UPDATE products SET starting_price = ?, highest_bidder = ? WHERE id = ?")
      .run(amount, bidder_address, id);
    
    res.json({ status: "success" });
  } catch (error: any) {
    console.error("Bid error:", error);
    res.status(500).json({ error: error.message || "Failed to place bid" });
  }
});

router.post("/products/:id/settle", async (req, res) => {
  const { id } = req.params;
  const { tx_id } = req.body;
  try {
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (tx_id) await algosdk.waitForConfirmation(algodClient, tx_id, 4);
    db.prepare("UPDATE products SET status = 'sold' WHERE id = ?").run(id);
    res.json({ status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to settle" });
  }
});

router.post("/orders/:id/confirm", (req, res) => {
  const { id } = req.params;
  const { address } = req.body;
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order || order.buyer_address !== address) return res.status(403).json({ error: "Unauthorized" });
    db.prepare("UPDATE orders SET status = 'received' WHERE id = ?").run(id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm" });
  }
});

export default router;
