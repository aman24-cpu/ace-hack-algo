import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { randomUUID } from "crypto";
import algosdk from "algosdk";

const app = express();
const PORT = 3000;
const db = new Database("campus_marketplace.db");

// Algorand Client for Verification
const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT = "";
const ALGOD_TOKEN = "";
const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

const SAVINGS_VAULT_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HDS7A";

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    seller_address TEXT NOT NULL,
    image_url TEXT,
    category TEXT,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_id TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS savings_goals (
    id TEXT PRIMARY KEY,
    user_address TEXT NOT NULL,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL,
    current_amount REAL DEFAULT 0,
    deadline DATETIME,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS savings_deposits (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    user_address TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(goal_id) REFERENCES savings_goals(id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    reward REAL NOT NULL,
    deadline DATETIME,
    creator_address TEXT NOT NULL,
    worker_address TEXT,
    status TEXT DEFAULT 'open', -- open, claimed, submitted, completed
    proof_url TEXT,
    tx_id TEXT, -- Escrow deposit tx
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

app.use(express.json());

// API Routes
app.get("/api/products", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE status = 'available' ORDER BY created_at DESC").all();
  res.json(products);
});

app.post("/api/products", (req, res) => {
  const { name, description, price, seller_address, image_url, category } = req.body;
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO products (id, name, description, price, seller_address, image_url, category) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, name, description, price, seller_address, image_url, category);
    res.json({ id, status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create product" });
  }
});

app.get("/api/my-listings/:address", (req, res) => {
  const listings = db.prepare("SELECT * FROM products WHERE seller_address = ? ORDER BY created_at DESC").all(req.params.address);
  res.json(listings);
});

app.get("/api/my-orders/:address", (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, p.name as product_name, p.image_url 
    FROM orders o 
    JOIN products p ON o.product_id = p.id 
    WHERE o.buyer_address = ? OR o.seller_address = ?
    ORDER BY o.created_at DESC
  `).all(req.params.address, req.params.address);
  res.json(orders);
});

app.post("/api/orders", async (req, res) => {
  const { product_id, buyer_address, seller_address, amount, tx_id } = req.body;
  const id = randomUUID();
  
  try {
    // 1. Verify Transaction on Algorand Network
    console.log(`Verifying transaction ${tx_id} on-chain...`);
    const txInfo = await algodClient.pendingTransactionInformation(tx_id).do();
    
    const info = txInfo as any;
    const signedTxn = info.txn || info.transaction;
    const txn = (signedTxn ? (signedTxn.txn || signedTxn) : info) as any;
    
    const type = txn.type || txn.ty;
    const isPayment = type === "pay" || (type instanceof Uint8Array && new TextDecoder().decode(type) === "pay");
    
    const getAddr = (val: any) => {
      if (!val) return "";
      if (typeof val === "string") return val;
      try {
        let pk = val.publicKey || val;
        if (pk && typeof pk === 'object' && !(pk instanceof Uint8Array) && Object.keys(pk).length === 32) {
          pk = new Uint8Array(Object.values(pk));
        }
        return algosdk.encodeAddress(pk);
      } catch (e) { return ""; }
    };

    const sender = getAddr(txn.sender || txn.snd || txn.from);
    const receiver = getAddr(txn.receiver || txn.rcv || txn.to);
    const txAmount = txn.amount || txn.amt || 0;

    const correctSender = sender === buyer_address;
    const correctReceiver = receiver === seller_address;
    const expectedMicroAlgos = Math.round(Number(amount) * 1_000_000);
    const correctAmount = Math.abs(Number(txAmount) - expectedMicroAlgos) < 10;

    if (!isPayment || !correctSender || !correctReceiver || !correctAmount) {
      console.error("Order verification failed:", { 
        isPayment, sender, receiver, txAmount: txAmount.toString(),
        expectedSender: buyer_address, expectedReceiver: seller_address, expectedAmount: expectedMicroAlgos
      });
      return res.status(400).json({ error: "On-chain transaction verification failed. Details mismatch." });
    }

    // 2. Commit to Database
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO orders (id, product_id, buyer_address, seller_address, amount, tx_id, status) VALUES (?, ?, ?, ?, ?, ?, 'paid')")
        .run(id, product_id, buyer_address, seller_address, amount, tx_id);
      db.prepare("UPDATE products SET status = 'sold' WHERE id = ?").run(product_id);
    });
    transaction();
    
    console.log(`Order ${id} successfully processed for transaction ${tx_id}`);
    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("Failed to process order:", error);
    res.status(500).json({ error: error.message || "Failed to process order" });
  }
});

app.post("/api/orders/:id/confirm", (req, res) => {
  const { id } = req.params;
  const { address } = req.body; // To verify the buyer is the one confirming
  
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as any;
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_address !== address) return res.status(403).json({ error: "Only the buyer can confirm receipt" });
    
    db.prepare("UPDATE orders SET status = 'received' WHERE id = ?").run(id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to confirm order" });
  }
});

// Savings Goals API
app.get("/api/savings/goals/:address", (req, res) => {
  const goals = db.prepare("SELECT * FROM savings_goals WHERE user_address = ? ORDER BY created_at DESC").all(req.params.address);
  res.json(goals);
});

app.post("/api/savings/goals", (req, res) => {
  const { user_address, name, target_amount, deadline } = req.body;
  const id = randomUUID();
  try {
    db.prepare("INSERT INTO savings_goals (id, user_address, name, target_amount, deadline) VALUES (?, ?, ?, ?, ?)")
      .run(id, user_address, name, target_amount, deadline);
    res.json({ id, status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to create savings goal" });
  }
});

app.get("/api/savings/deposits/:goalId", (req, res) => {
  const deposits = db.prepare("SELECT * FROM savings_deposits WHERE goal_id = ? ORDER BY created_at ASC").all(req.params.goalId);
  res.json(deposits);
});

app.post("/api/savings/deposits", async (req, res) => {
  const { goal_id, user_address, amount, tx_id } = req.body;
  const id = randomUUID();
  
  try {
    // 1. Verify Transaction on Algorand Network
    console.log(`Verifying savings deposit ${tx_id} on-chain...`);
    const txInfo = await algodClient.pendingTransactionInformation(tx_id).do();
    
    // Try to find the transaction object in various possible locations in the response
    const info = txInfo as any;
    const signedTxn = info.txn || info.transaction;
    const txn = (signedTxn ? (signedTxn.txn || signedTxn) : info) as any;
    
    // Algorand transactions can have different field names depending on whether they are raw or SDK-wrapped
    const type = txn.type || txn.ty;
    const isPayment = type === "pay" || (type instanceof Uint8Array && new TextDecoder().decode(type) === "pay");
    
    const getAddr = (val: any) => {
      if (!val) return "";
      if (typeof val === "string") return val;
      try {
        let pk = val.publicKey || val;
        if (pk && typeof pk === 'object' && !(pk instanceof Uint8Array) && Object.keys(pk).length === 32) {
          pk = new Uint8Array(Object.values(pk));
        }
        return algosdk.encodeAddress(pk);
      } catch (e) {
        return "";
      }
    };

    const sender = getAddr(txn.sender || txn.snd || txn.from);
    const receiver = getAddr(txn.receiver || txn.rcv || txn.to);
    const txAmount = txn.amount || txn.amt || 0;

    const correctSender = sender === user_address;
    const correctReceiver = receiver === SAVINGS_VAULT_ADDRESS;
    const expectedMicroAlgos = Math.round(Number(amount) * 1_000_000);
    const correctAmount = Math.abs(Number(txAmount) - expectedMicroAlgos) < 10; // Allow small rounding diff

    console.log("Savings Verification Details:", {
      isPayment,
      sender,
      receiver,
      txAmount: txAmount.toString(),
      correctSender,
      correctReceiver,
      correctAmount,
      expectedSender: user_address,
      expectedReceiver: SAVINGS_VAULT_ADDRESS,
      expectedAmount: expectedMicroAlgos
    });

    if (!isPayment || !correctSender || !correctReceiver || !correctAmount) {
      console.error("Savings verification failed:", { 
        isPayment, 
        sender, 
        receiver, 
        txAmount: typeof txAmount === 'bigint' ? txAmount.toString() : txAmount,
        expectedSender: user_address,
        expectedAmount: expectedMicroAlgos,
        type
      });
      return res.status(400).json({ error: "On-chain transaction verification failed." });
    }

    // 2. Commit to Database
    const transaction = db.transaction(() => {
      db.prepare("INSERT INTO savings_deposits (id, goal_id, user_address, amount, tx_id) VALUES (?, ?, ?, ?, ?)")
        .run(id, goal_id, user_address, amount, tx_id);
      db.prepare("UPDATE savings_goals SET current_amount = current_amount + ? WHERE id = ?").run(amount, goal_id);
      
      // Check if goal reached
      const goal = db.prepare("SELECT * FROM savings_goals WHERE id = ?").get(goal_id) as any;
      if (goal.current_amount >= goal.target_amount) {
        db.prepare("UPDATE savings_goals SET status = 'completed' WHERE id = ?").run(goal_id);
      }
    });
    transaction();
    
    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("Failed to process deposit:", error);
    res.status(500).json({ error: error.message || "Failed to process deposit" });
  }
});

// Campus Gigs API
app.get("/api/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC").all();
  res.json(tasks);
});

app.post("/api/tasks", async (req, res) => {
  const { title, description, reward, deadline, creator_address } = req.body;
  const id = randomUUID();
  
  try {
    // Save to DB without escrow verification
    db.prepare("INSERT INTO tasks (id, title, description, reward, deadline, creator_address) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, title, description, reward, deadline, creator_address);
    
    res.json({ id, status: "success" });
  } catch (error: any) {
    console.error("Failed to post gig:", error);
    res.status(500).json({ error: error.message || "Failed to post gig" });
  }
});

app.post("/api/tasks/:id/claim", (req, res) => {
  const { id } = req.params;
  const { worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== 'open') return res.status(400).json({ error: "Task is no longer available" });
    if (task.creator_address === worker_address) return res.status(400).json({ error: "You cannot claim your own task" });

    db.prepare("UPDATE tasks SET worker_address = ?, status = 'claimed' WHERE id = ?").run(worker_address, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to claim task" });
  }
});

app.post("/api/tasks/:id/submit", (req, res) => {
  const { id } = req.params;
  const { proof_url, worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.worker_address !== worker_address) return res.status(403).json({ error: "Only the claimant can submit proof" });

    db.prepare("UPDATE tasks SET proof_url = ?, status = 'submitted' WHERE id = ?").run(proof_url, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit proof" });
  }
});

app.post("/api/tasks/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { creator_address, tx_id } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.creator_address !== creator_address) return res.status(403).json({ error: "Only the creator can approve" });
    if (!tx_id) return res.status(400).json({ error: "Payment transaction ID is required for approval" });

    // Verify Payment Transaction (Funds sent directly to worker)
    console.log(`Verifying gig payment ${tx_id} on-chain for task ${id}...`);
    const txInfo = await algodClient.pendingTransactionInformation(tx_id).do();
    const info = txInfo as any;
    console.log("Transaction Info:", JSON.stringify(info, (k, v) => typeof v === 'bigint' ? v.toString() : v).substring(0, 200) + "...");
    const signedTxn = info.txn || info.transaction;
    const txn = (signedTxn ? (signedTxn.txn || signedTxn) : info) as any;
    
    const type = txn.type || txn.ty;
    const isPayment = type === "pay" || (type instanceof Uint8Array && new TextDecoder().decode(type) === "pay");
    
    const getAddr = (val: any) => {
      if (!val) return "";
      if (typeof val === "string") return val;
      try {
        let pk = val.publicKey || val;
        if (pk && typeof pk === 'object' && !(pk instanceof Uint8Array) && Object.keys(pk).length === 32) {
          pk = new Uint8Array(Object.values(pk));
        }
        return algosdk.encodeAddress(pk);
      } catch (e) {
        return "";
      }
    };

    const sender = getAddr(txn.sender || txn.snd || txn.from);
    const receiver = getAddr(txn.receiver || txn.rcv || txn.to);
    const txAmount = txn.amount || txn.amount || txn.amt || 0;

    const correctSender = sender === creator_address;
    const correctReceiver = receiver === task.worker_address;
    const expectedMicroAlgos = Math.round(Number(task.reward) * 1_000_000);
    const correctAmount = Math.abs(Number(txAmount) - expectedMicroAlgos) < 10;

    console.log("Verification Details:", {
      isPayment,
      sender,
      receiver,
      txAmount: txAmount.toString(),
      correctSender,
      correctReceiver,
      correctAmount,
      expectedSender: creator_address,
      expectedReceiver: task.worker_address,
      expectedAmount: expectedMicroAlgos
    });

    if (!isPayment || !correctSender || !correctReceiver || !correctAmount) {
      return res.status(400).json({ 
        error: "Payment transaction verification failed.",
        details: { isPayment, correctSender, correctReceiver, correctAmount }
      });
    }

    db.prepare("UPDATE tasks SET status = 'completed', tx_id = ? WHERE id = ?").run(tx_id, id);
    res.json({ status: "success" });
  } catch (error: any) {
    console.error("Failed to approve task:", error);
    res.status(500).json({ error: error.message || "Failed to approve task" });
  }
});

app.get("/api/my-tasks/:address", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE creator_address = ? OR worker_address = ? ORDER BY created_at DESC").all(req.params.address, req.params.address);
  res.json(tasks);
});

app.get("/api/history/:address", async (req, res) => {
  const { address } = req.params;
  const INDEXER_SERVER = "https://testnet-idx.algonode.cloud";
  try {
    const response = await fetch(`${INDEXER_SERVER}/v2/accounts/${address}/transactions?limit=10`);
    if (!response.ok) return res.json({ transactions: [] });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error proxying history:", error);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
