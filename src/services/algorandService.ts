import { PeraWalletConnect } from "@perawallet/connect";
import algosdk from "algosdk";
import { Buffer } from "buffer";

// Polyfill Buffer for algosdk in this module
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

// Constants for Algorand Testnet
const ALGOD_SERVER = "https://testnet-api.algonode.cloud";
const ALGOD_PORT = "";
const ALGOD_TOKEN = "";

export const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);

// Dedicated Vault Address for Savings Goals (Testnet)
// In a production app, this would be a Smart Contract address.
export const SAVINGS_VAULT_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HDS7A";

// Pera Wallet Connect Configuration
export const peraWallet = new PeraWalletConnect({
  chainId: 416002, // Algorand Testnet
});

export interface AccountInfo {
  address: string;
  amount: bigint; // in microAlgos
  assets: Array<any>;
}

export interface Transaction {
  id: string;
  sender: string;
  receiver: string;
  amount: number;
  type: string;
  timestamp: number;
}

export const formatAlgo = (microAlgos: bigint | number) => {
  const amount = typeof microAlgos === "bigint" ? Number(microAlgos) : microAlgos;
  return (amount / 1_000_000).toFixed(6);
};

export const getAccountInfo = async (address: string): Promise<AccountInfo> => {
  const info = await algodClient.accountInformation(address).do();
  return {
    address: info.address,
    amount: BigInt(info.amount),
    assets: info.assets || [],
  };
};

export const getTransactionHistory = async (address: string): Promise<Transaction[]> => {
  try {
    const response = await fetch(`/api/history/${address}`);
    if (!response.ok) {
      console.warn("History proxy failed, falling back to empty list");
      return [];
    }
    const data = await response.json();
    
    if (!data || !data.transactions) return [];

    return data.transactions.map((tx: any) => ({
      id: tx.id,
      sender: tx.sender,
      receiver: tx["payment-transaction"]?.receiver || tx["asset-transfer-transaction"]?.receiver || "",
      amount: tx["payment-transaction"]?.amount || tx["asset-transfer-transaction"]?.amount || 0,
      type: tx["tx-type"],
      timestamp: tx["round-time"] * 1000,
    }));
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return [];
  }
};

export interface Student {
  name: string;
  address: string;
  major: string;
  avatar: string;
}

export const CAMPUS_DIRECTORY: Student[] = [
  {
    name: "Campus Bookstore",
    address: "BOOKSTORE_ADDRESS_HERE",
    major: "Merchant",
    avatar: "https://picsum.photos/seed/bookstore/100",
  },
  {
    name: "Student Union Cafe",
    address: "CAFE_ADDRESS_HERE",
    major: "Merchant",
    avatar: "https://picsum.photos/seed/cafe/100",
  },
  {
    name: "Alice Johnson",
    address: "ALICE_ADDRESS_HERE",
    major: "Computer Science",
    avatar: "https://picsum.photos/seed/alice/100",
  },
  {
    name: "Bob Smith",
    address: "BOB_ADDRESS_HERE",
    major: "Economics",
    avatar: "https://picsum.photos/seed/bob/100",
  },
];

// Marketplace Types
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  seller_address: string;
  image_url: string;
  category: string;
  status: 'available' | 'sold';
  created_at: string;
}

export interface Order {
  id: string;
  product_id: string;
  buyer_address: string;
  seller_address: string;
  amount: number;
  tx_id: string;
  status: 'pending' | 'paid' | 'received' | 'completed';
  created_at: string;
  product_name?: string;
  image_url?: string;
}

// Marketplace API
export const getProducts = async (): Promise<Product[]> => {
  const response = await fetch("/api/products");
  return response.json();
};

export const createProduct = async (product: Omit<Product, 'id' | 'status' | 'created_at'>) => {
  const response = await fetch("/api/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(product),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create product");
  }
  return response.json();
};

export const getMyListings = async (address: string): Promise<Product[]> => {
  const response = await fetch(`/api/my-listings/${address}`);
  if (!response.ok) return [];
  return response.json();
};

export const getMyOrders = async (address: string): Promise<Order[]> => {
  const response = await fetch(`/api/my-orders/${address}`);
  if (!response.ok) return [];
  return response.json();
};

export const createOrder = async (order: Omit<Order, 'id' | 'status' | 'created_at'>) => {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to process order in backend");
  }
  return response.json();
};

export const confirmOrder = async (orderId: string, address: string) => {
  const response = await fetch(`/api/orders/${orderId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to confirm receipt");
  }
  return response.json();
};

// Savings Goals Types
export interface SavingsGoal {
  id: string;
  user_address: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string;
  status: 'active' | 'completed';
  created_at: string;
}

export interface SavingsDeposit {
  id: string;
  goal_id: string;
  user_address: string;
  amount: number;
  tx_id: string;
  created_at: string;
}

// Savings Goals API
export const getSavingsGoals = async (address: string): Promise<SavingsGoal[]> => {
  const response = await fetch(`/api/savings/goals/${address}`);
  if (!response.ok) return [];
  return response.json();
};

export const createSavingsGoal = async (goal: Omit<SavingsGoal, 'id' | 'current_amount' | 'status' | 'created_at'>) => {
  const response = await fetch("/api/savings/goals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(goal),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create savings goal");
  }
  return response.json();
};

export const getSavingsDeposits = async (goalId: string): Promise<SavingsDeposit[]> => {
  const response = await fetch(`/api/savings/deposits/${goalId}`);
  if (!response.ok) return [];
  return response.json();
};

export const createSavingsDeposit = async (deposit: Omit<SavingsDeposit, 'id' | 'created_at'>) => {
  const response = await fetch("/api/savings/deposits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(deposit),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to process deposit");
  }
  return response.json();
};

// Campus Gigs Types
export interface GigTask {
  id: string;
  title: string;
  description: string;
  reward: number;
  deadline: string;
  creator_address: string;
  worker_address: string | null;
  status: 'open' | 'claimed' | 'submitted' | 'completed';
  proof_url: string | null;
  tx_id?: string;
  created_at: string;
}

// Campus Gigs API
export const getTasks = async (): Promise<GigTask[]> => {
  const response = await fetch("/api/tasks");
  return response.json();
};

export const createGigTask = async (task: Omit<GigTask, 'id' | 'worker_address' | 'status' | 'proof_url' | 'created_at' | 'tx_id'>) => {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to post gig");
  }
  return response.json();
};

export const claimTask = async (taskId: string, workerAddress: string) => {
  const response = await fetch(`/api/tasks/${taskId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker_address: workerAddress }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to claim task");
  }
  return response.json();
};

export const submitProof = async (taskId: string, workerAddress: string, proofUrl: string) => {
  const response = await fetch(`/api/tasks/${taskId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worker_address: workerAddress, proof_url: proofUrl }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to submit proof");
  }
  return response.json();
};

export const approveTask = async (taskId: string, creatorAddress: string, txId: string) => {
  const response = await fetch(`/api/tasks/${taskId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creator_address: creatorAddress, tx_id: txId }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to approve task");
  }
  return response.json();
};

export const getMyTasks = async (address: string): Promise<GigTask[]> => {
  const response = await fetch(`/api/my-tasks/${address}`);
  if (!response.ok) return [];
  return response.json();
};
