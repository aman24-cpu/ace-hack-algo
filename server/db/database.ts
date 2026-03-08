import Database from "better-sqlite3";

export const db = new Database("campus_marketplace.db");

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
    quantity INTEGER DEFAULT 1,
    is_auction BOOLEAN DEFAULT 0,
    starting_price REAL,
    auction_end DATETIME,
    highest_bidder TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    amount REAL NOT NULL,
    quantity INTEGER DEFAULT 1,
    tx_id TEXT,
    status TEXT DEFAULT 'pending',
    shipment_status TEXT DEFAULT 'pending',
    escrow_app_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
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
    tx_id TEXT, -- Escrow deposit tx OR completion tx
    app_id INTEGER, -- Smart Contract ID
    worker_rating INTEGER,
    milestones TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expense_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS group_participants (
    group_id INTEGER,
    address TEXT NOT NULL,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    payer_address TEXT NOT NULL,
    split_type TEXT DEFAULT 'equal', -- equal, weighted
    weighted_data TEXT, -- JSON string
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );

  CREATE TABLE IF NOT EXISTS expense_splits (
    expense_id INTEGER,
    address TEXT NOT NULL,
    share REAL NOT NULL,
    FOREIGN KEY(expense_id) REFERENCES expenses(id)
  );

  CREATE TABLE IF NOT EXISTS settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount REAL NOT NULL,
    tx_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES expense_groups(id)
  );
`);

// Migrations
try {
  db.prepare("ALTER TABLE tasks ADD COLUMN app_id INTEGER").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) {
    console.error("Migration error (app_id):", e.message);
  }
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 1").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) {
    console.error("Migration error (quantity):", e.message);
  }
}
try {
  db.prepare("ALTER TABLE products ADD COLUMN is_auction BOOLEAN DEFAULT 0").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (is_auction):", e.message);
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN starting_price REAL").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (starting_price):", e.message);
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN auction_end DATETIME").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (auction_end):", e.message);
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN highest_bidder TEXT").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (highest_bidder):", e.message);
}

try {
  db.prepare("ALTER TABLE products ADD COLUMN app_id INTEGER").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (product app_id):", e.message);
}

try {
  db.prepare("ALTER TABLE tasks ADD COLUMN worker_rating INTEGER").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (worker_rating):", e.message);
}

try {
  db.prepare("ALTER TABLE tasks ADD COLUMN milestones TEXT").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (milestones):", e.message);
}

try {
  db.prepare("ALTER TABLE orders ADD COLUMN shipment_status TEXT DEFAULT 'pending'").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (shipment_status):", e.message);
}

try {
  db.prepare("ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (order quantity):", e.message);
}

try {
  db.prepare("ALTER TABLE orders ADD COLUMN escrow_app_id INTEGER").run();
} catch (e: any) {
  if (!e.message.includes("duplicate column name")) console.error("Migration error (escrow_app_id):", e.message);
}
