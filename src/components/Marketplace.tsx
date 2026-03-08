import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Search, 
  Plus, 
  ShoppingBag, 
  Tag, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Truck,
  Package,
  ArrowRight,
  ChevronRight,
  Filter,
  Star,
  MessageSquare,
  ShieldCheck,
  Calendar,
  ExternalLink,
  Coins,
  History,
  CreditCard,
  User as UserIcon,
  Store,
  Wallet,
  Users
} from "lucide-react";
import { 
  algodClient, 
  getProducts,
  getMyListings, 
  getMyOrders, 
  createOrder,
  confirmOrder,
  formatAlgo,
  USDC_ID,
  peraWallet,
  checkAssetOptIn,
  optInToAsset,
  getAssetBalance,
  startAuctionOnChain,
  placeBidOnChain,
  settleAuctionOnChain
} from "../services/algorandService";
import algosdk from "algosdk";
import { cn } from "../lib/utils";

interface MarketplaceProps {
  accountAddress: string | null;
  onRefreshBalance: () => void;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  seller_address: string;
  image_url: string;
  category: string;
  status: string;
  is_auction?: boolean;
  starting_price?: number;
  auction_end?: string;
  highest_bidder?: string;
  quantity: number;
  created_at: string;
}

interface Order {
  id: string;
  product_id: string;
  buyer_address: string;
  seller_address: string;
  amount: number;
  quantity: number;
  tx_id: string;
  status: string;
  shipment_status: string;
  created_at: string;
  product_name?: string;
  image_url?: string;
}

// Helper Component for Auction Countdowns
const CountdownTimer: React.FC<{ end: string }> = ({ end }) => {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    const calculateTime = () => {
      const remaining = new Date(end).getTime() - new Date().getTime();
      if (remaining <= 0) {
        setTimeLeft("Auction Ended");
      } else {
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };
    calculateTime();
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [end]);

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full shadow-lg">
      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      <span className="text-[9px] font-black text-white uppercase tracking-wider tabular-nums">{timeLeft}</span>
    </div>
  );
};

export default function Marketplace({ accountAddress, onRefreshBalance }: MarketplaceProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [myListings, setMyListings] = useState<Product[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBuying, setIsBuying] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSplitPurchase, setIsSplitPurchase] = useState(false);
  const [selectedSplitGroup, setSelectedSplitGroup] = useState<number | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);
  const [productQuantities, setProductQuantities] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<any[]>([]);
  const [showCheckoutModal, setShowCheckoutModal] = useState<Product | null>(null);
  const [activeView, setActiveView] = useState<"all" | "my-listings" | "my-orders">("all");
  const [paymentCurrency, setPaymentCurrency] = useState<"ALGO" | "USDC">("ALGO");
  const [showBidModal, setShowBidModal] = useState<Product | null>(null);
  const [bidAmount, setBidAmount] = useState<string>("");
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [isConfirming, setIsConfirming] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string>("");
  const [isAuctionForm, setIsAuctionForm] = useState(false);
  const [isOptedIn, setIsOptedIn] = useState(true);
  const [isOptingIn, setIsOptingIn] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [allProducts, listings, orders, groupsRes] = await Promise.all([
        getProducts(),
        getMyListings(accountAddress),
        getMyOrders(accountAddress),
        fetch(`/api/groups/${accountAddress}`)
      ]);
      setProducts(allProducts);
      setMyListings(listings);
      setMyOrders(orders);
      if (groupsRes.ok) {
        setGroups(await groupsRes.json());
      }
      
      if (accountAddress) {
        const opted = await checkAssetOptIn(accountAddress, USDC_ID);
        setIsOptedIn(opted);
      }
    } catch (error) {
      console.error("Failed to load marketplace data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (accountAddress) {
      console.log(`📍 Connected to: ${accountAddress}`);
    }
    loadData();
  }, [accountAddress]);

  const handleBuy = async (product: Product) => {
    if (!accountAddress) {
      alert("Please connect your wallet first.");
      return;
    }

    if (product.seller_address === accountAddress) {
      alert("You cannot buy your own item!");
      return;
    }

    setIsBuying(product.id);
    setPurchaseStatus("Initializing...");
    console.log("=== PURCHASE START ===");
    console.log("Product:", product.id, "Account:", accountAddress);

    try {
      // 1. Params
      setPurchaseStatus("Fetching network params...");
      const suggestedParams = await algodClient.getTransactionParams().do();
      console.log("Params fetched.");

      // 2. Build
      const totalAmount = Number(product.price) * purchaseQuantity;
      const amountMicro = Math.round(totalAmount * 1_000_000);

      // 1.5 Opt-in Check for USDC
      if (paymentCurrency === "USDC") {
        setPurchaseStatus("Checking opt-in status...");
        console.log("Checking USDC opt-in for Seller:", product.seller_address);
        console.log("Checking USDC opt-in for Buyer:", accountAddress);
        
        const [isSellerOptedIn, isBuyerOptedIn] = await Promise.all([
          checkAssetOptIn(product.seller_address.trim(), USDC_ID),
          checkAssetOptIn(accountAddress.trim(), USDC_ID)
        ]);

        if (!isSellerOptedIn) {
          const shortAddr = product.seller_address.slice(0, 8) + "..." + product.seller_address.slice(-4);
          throw new Error(`The seller (${shortAddr}) is not opted-in to receive USDC (Asset ID: ${USDC_ID}). Both parties must click "Enable USDC" in the header.`);
        }
        if (!isBuyerOptedIn) {
          throw new Error(`Your wallet is not opted-in to USDC (Asset ID: ${USDC_ID}). Please click the "Enable USDC" button in the header.`);
        }

        // 1.7 Balance Check
        setPurchaseStatus("Checking funds...");
        const balance = await getAssetBalance(accountAddress, USDC_ID);
        if (balance < BigInt(amountMicro)) {
          const needed = (amountMicro / 1_000_000).toFixed(2);
          const current = (Number(balance) / 1_000_000).toFixed(2);
          throw new Error(`Insufficient USDC funds. You need ${needed} USDC but only have ${current} USDC in your wallet.`);
        }
      }

      const note = new TextEncoder().encode(JSON.stringify({
        type: "marketplace_purchase",
        p: product.id,
        c: product.category
      }));

      setPurchaseStatus("Building transaction...");
      
      let txn: algosdk.Transaction;
      if (paymentCurrency === "ALGO") {
        txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
          sender: accountAddress,
          receiver: product.seller_address.trim(),
          amount: BigInt(amountMicro),
          suggestedParams: suggestedParams,
          note: note
        });
      } else {
        // USDC ASA Transfer
        txn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
          sender: accountAddress,
          receiver: product.seller_address.trim(),
          amount: BigInt(amountMicro),
          assetIndex: USDC_ID,
          suggestedParams: suggestedParams,
          note: note
        });
      }
      console.log("Created transaction:", txn);
      console.log(`📡 [SENDING] Transaction Details: Type=${txn.type}, AssetID=${(txn as any).assetIndex || 'N/A'}`);
      
      if (paymentCurrency === "USDC" && txn.type !== "axfer") {
        throw new Error("Logic error: Selected USDC but built a non-axfer transaction!");
      }

      console.log("Txn built successfully.");

      // 3. Sign
      setPurchaseStatus("Waiting for signature...");
      // Wrap in a group for Pera Wallet consistency
      const txns = [txn];
      algosdk.assignGroupID(txns);
      
      const singleTxnGroups = [{ txn: txns[0], signers: [accountAddress] }];
      const signedTxns = await peraWallet.signTransaction([singleTxnGroups]);
      
      if (!signedTxns || signedTxns.length === 0) throw new Error("Wallet returned no signed transactions.");

      // 4. Send
      setPurchaseStatus("Broadcasting...");
      const sendRes = await algodClient.sendRawTransaction(signedTxns).do();
      const txId = (sendRes as any).txId || sendRes.txid; // Generic fallback
      console.log("Sent txId:", txId);

      // 5. Confirm
      setPurchaseStatus("Confirming...");
      await algosdk.waitForConfirmation(algodClient, txId, 4);
      console.log("Confirmed on-chain.");
      
      // 6. Backend
      setPurchaseStatus("Finalizing order...");
      await createOrder({
        product_id: product.id,
        buyer_address: accountAddress,
        seller_address: product.seller_address,
        amount: Number(product.price),
        quantity: purchaseQuantity,
        currency: paymentCurrency,
        tx_id: txId
      });

      // 7. Split Expense if requested
      if (isSplitPurchase && selectedSplitGroup) {
        setPurchaseStatus("Setting up split...");
        const groupDetails = await (await fetch(`/api/groups/${selectedSplitGroup}/details`)).json();
        const participants = groupDetails.participants.map((p: any) => p.address);
        const totalSplitAmount = Number(product.price) * purchaseQuantity;
        const share = totalSplitAmount / participants.length;
        
        await fetch("/api/expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId: selectedSplitGroup,
            description: `Split for ${product.name} (x${purchaseQuantity})`,
            amount: totalSplitAmount,
            payerAddress: accountAddress,
            splits: participants.map((addr: string) => ({ address: addr, share }))
          }),
        });
      }

      console.log("Backend updated.");

      setPurchaseStatus("Success!");
      alert("Purchase successful!" + (isSplitPurchase ? " Split created." : ""));
      setShowCheckoutModal(null);
      setIsSplitPurchase(false);
      onRefreshBalance();
      loadData();
    } catch (error: any) {
      console.error("PURCHASE CRASH:", error);
      const stack = error?.stack || "No stack trace";
      alert(`PURCHASE FAILED\n\n${error.message}\n\nStack: ${stack.slice(0, 150)}...`);
    } finally {
      setIsBuying(null);
      setPurchaseStatus("");
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    setIsConfirming(orderId);
    try {
      await confirmOrder(orderId, accountAddress);
      alert("Receipt confirmed!");
      loadData();
    } catch (error: any) {
      alert(error.message || "Failed to confirm");
    } finally {
      setIsConfirming(null);
    }
  };

  const handleShipOrder = async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: accountAddress }),
      });
      if (!response.ok) throw new Error("Failed to mark as shipped");
      alert("Item marked as shipped!");
      loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handlePlaceBid = async (productId: string, amount: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (product.seller_address === accountAddress) {
      alert("You cannot bid on your own item!");
      return;
    }
    
    try {
      setPurchaseStatus("Confirming bid on-chain...");
      let txId = "";
      
      // If it's a smart contract auction, call the app
      if (product.app_id) {
        txId = await placeBidOnChain(accountAddress, product.app_id, amount);
      }

      const response = await fetch(`/api/products/${productId}/bid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          bidder_address: accountAddress, 
          amount,
          tx_id: txId
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to place bid");
      }
      alert("Bid placed successfully!");
      loadData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setPurchaseStatus("");
    }
  };

  const handleSettleAuction = async (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product || !product.app_id) return;
    
    try {
      setPurchaseStatus("Settling auction on-chain...");
      const txId = await settleAuctionOnChain(accountAddress!, product.app_id);
      
      const response = await fetch(`/api/products/${productId}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tx_id: txId }),
      });

      if (!response.ok) {
        throw new Error("Failed to settle auction in backend");
      }
      
      alert("Auction settled! Funds claimed.");
      loadData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setPurchaseStatus("");
    }
  };

  const handleOptIn = async () => {
    if (!accountAddress) return;
    setIsOptingIn(true);
    console.log(`🚀 Requesting USDC opt-in for: ${accountAddress}`);
    try {
      const txId = await optInToAsset(accountAddress, USDC_ID);
      console.log(`✅ Opt-in successful! TxID: ${txId}`);
      await loadData();
      alert(`USDC enabled successfully! \n\nAccount: ${accountAddress.slice(0, 10)}... \nTxID: ${txId.slice(0, 10)}...`);
    } catch (error: any) {
      console.error("Opt-in Error:", error);
      alert("Failed to enable USDC: " + error.message);
    } finally {
      setIsOptingIn(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Marketplace Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">Campus Marketplace</h2>
          <p className="text-zinc-500">Buy and sell items within the student community.</p>
        </div>
        
        <div className="flex items-center gap-4">
          {!isOptedIn && accountAddress && (
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={handleOptIn}
                disabled={isOptingIn}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-[11px] font-black uppercase tracking-wider hover:bg-emerald-100 transition-all shadow-sm"
              >
                {isOptingIn ? "Enabling..." : (
                  <>
                    <ShieldCheck className="w-3 h-3" /> Enable USDC
                  </>
                )}
              </button>
              <span className="text-[8px] text-zinc-400 font-bold uppercase tracking-tighter">
                For: {accountAddress.slice(0, 6)}...{accountAddress.slice(-4)}
              </span>
            </div>
          )}

          <button 
            onClick={() => setIsAddingProduct(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-bold hover:bg-zinc-800 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" /> Sell Item
          </button>

          <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-xl">
            <button 
              onClick={() => setActiveView("all")}
              className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeView === "all" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
            >
              All Items
            </button>
            <button 
              onClick={() => setActiveView("my-listings")}
              className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeView === "my-listings" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
            >
              My Listings
            </button>
            <button 
              onClick={() => setActiveView("my-orders")}
              className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", activeView === "my-orders" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900")}
            >
              My Orders
            </button>
          </div>
        </div>
      </div>

      {activeView === "all" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map(product => (
            <div key={product.id} className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div className="aspect-[4/3] bg-zinc-100 relative">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-zinc-900 uppercase tracking-wider">
                  {product.category}
                </div>
                {product.is_auction && product.auction_end && (
                  <div className="absolute top-4 right-4">
                    <CountdownTimer end={product.auction_end} />
                  </div>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                      {product.name}
                      {product.is_auction && <span className="px-1.5 py-0.5 bg-zinc-900 text-white text-[8px] rounded uppercase">Auction</span>}
                    </h3>
                    <p className="text-xs text-zinc-500 line-clamp-1">{product.description}</p>
                    {!product.is_auction && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className={cn(
                          "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                          product.quantity > 0 ? "bg-zinc-100 text-zinc-600" : "bg-red-50 text-red-500"
                        )}>
                          {product.quantity > 0 ? `${product.quantity} In Stock` : "Out of Stock"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-zinc-900">{product.is_auction ? product.starting_price : product.price} ALGO</p>
                    <p className="text-[10px] text-zinc-400">{product.is_auction ? "Current Bid" : "Fixed Price"}</p>
                  </div>
                </div>

                {!product.is_auction && product.quantity > 1 && (
                  <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-xl border border-zinc-100 mb-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-2">Quantity</span>
                    <div className="flex items-center gap-3">
                      <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           setProductQuantities({ ...productQuantities, [product.id]: Math.max(1, (productQuantities[product.id] || 1) - 1) });
                         }}
                         className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-900 transition-colors"
                      >-</button>
                      <span className="text-sm font-bold w-4 text-center">{productQuantities[product.id] || 1}</span>
                      <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           setProductQuantities({ ...productQuantities, [product.id]: Math.min(product.quantity, (productQuantities[product.id] || 1) + 1) });
                         }}
                         className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-900 transition-colors"
                      >+</button>
                    </div>
                  </div>
                )}

                {(() => {
                  const isEnded = product.is_auction && product.auction_end && new Date(product.auction_end) < new Date();
                  const isWinner = isEnded && product.highest_bidder === accountAddress;
                  
                  if (product.is_auction) {
                    if (isEnded) {
                      if (isWinner && product.status !== 'sold') {
                        return (
                          <div className="w-full py-3 rounded-xl bg-emerald-50 text-emerald-600 font-bold text-center text-sm border border-emerald-100 flex items-center justify-center gap-2">
                             <CheckCircle2 className="w-4 h-4" /> You won! Awaiting shipment.
                          </div>
                        );
                      }
                      return (
                        <button disabled className="w-full py-3 rounded-xl bg-zinc-100 text-zinc-400 font-bold text-sm">
                          Auction Ended
                        </button>
                      );
                    }
                    return (
                      <button 
                        onClick={() => {
                          setBidAmount("");
                          setShowBidModal(product);
                        }}
                        disabled={product.status === 'sold'}
                        className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm transition-all shadow-lg shadow-zinc-200"
                      >
                        Place Bid
                      </button>
                    );
                  }

                  return (
                    <button 
                      onClick={() => {
                        setPurchaseQuantity(productQuantities[product.id] || 1);
                        setShowCheckoutModal(product);
                      }}
                      disabled={isBuying !== null || product.status === 'sold' || product.quantity <= 0}
                      className="w-full py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-sm transition-all disabled:opacity-50"
                    >
                      {isBuying === product.id ? purchaseStatus || "Processing..." : (product.status === 'sold' || product.quantity <= 0) ? "Sold Out" : `Buy ${productQuantities[product.id] || 1} Now`}
                    </button>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeView === "my-listings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {myListings.map(product => (
            <div key={product.id} className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm relative">
              {product.status === 'sold' && (
                <div className="absolute top-4 right-4 z-10 bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                  Sold
                </div>
              )}
              <div className="aspect-[4/3] bg-zinc-100">
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover grayscale-[0.5]" />
              </div>
              <div className="p-6">
                <h3 className="font-bold text-zinc-900 mb-1">{product.name}</h3>
                <p className="text-xl font-black text-zinc-900 mb-4">{product.price} ALGO</p>
                
                {product.status === 'sold' ? (
                  <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                    <p className="text-[10px] text-zinc-400 uppercase font-black tracking-widest mb-2">Order Activity</p>
                    {myOrders.find(o => o.product_id === product.id && o.seller_address === accountAddress)?.shipment_status === 'pending' ? (
                      <button 
                        onClick={() => handleShipOrder(myOrders.find(o => o.product_id === product.id)!.id)}
                        className="w-full py-3 bg-zinc-900 text-white rounded-xl text-xs font-black uppercase tracking-widest"
                      >
                        Mark as Shipped
                      </button>
                    ) : (
                      <p className="text-xs text-emerald-600 font-bold flex items-center gap-2">
                        <Truck className="w-4 h-4" /> Item Shipped
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-zinc-400 text-xs font-bold uppercase tracking-widest">
                      <Clock className="w-4 h-4" /> Active Listing
                    </div>
                    {product.is_auction && product.auction_end && new Date(product.auction_end) < new Date() && (
                      <button 
                        onClick={() => handleSettleAuction(product.id)}
                        className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                      >
                        Settle & Claim Funds
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {myListings.length === 0 && (
            <div className="col-span-full py-20 bg-zinc-50 rounded-[3rem] border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-500">
              <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold">You haven't listed anything yet.</p>
            </div>
          )}
        </div>
      )}

      {activeView === "my-orders" && (
        <div className="space-y-4">
          {myOrders.map(order => {
            const isBuyer = order.buyer_address === accountAddress;
            return (
              <div key={order.id} className="bg-white border border-zinc-200 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-zinc-100 rounded-[1.5rem] overflow-hidden shrink-0">
                    <img src={order.image_url} alt={order.product_name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-bold text-zinc-900 text-lg">{order.product_name || `Order #${order.id.slice(0, 8)}`}</h4>
                      <span className={cn(
                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                        isBuyer ? "bg-blue-50 text-blue-600" : "bg-purple-50 text-purple-600"
                      )}>
                        {isBuyer ? "Purchased" : "Sold"}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-500 mb-2">
                      {isBuyer ? `From: ${order.seller_address.slice(0, 10)}...` : `To: ${order.buyer_address.slice(0, 10)}...`}
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                        order.shipment_status === 'shipped' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      )}>
                        {order.shipment_status === 'shipped' ? <Truck className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                        {order.shipment_status === 'shipped' ? "Shipped" : "Processing"}
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5",
                        order.status === 'received' ? "bg-emerald-50 text-emerald-600" : "bg-zinc-100 text-zinc-400"
                      )}>
                        {order.status === 'received' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                        {order.status === 'received' ? "Completed" : "Escrow Active"}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-col items-end gap-3">
                  <p className="text-xl font-black text-zinc-900">{order.amount} ALGO</p>
                  
                  {isBuyer && order.shipment_status === 'shipped' && order.status === 'paid' && (
                    <button 
                      onClick={() => handleConfirmReceipt(order.id)}
                      disabled={isConfirming === order.id}
                      className="px-6 py-2.5 bg-zinc-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
                    >
                      {isConfirming === order.id ? "Confirming..." : "Confirm Receipt"}
                    </button>
                  )}
                  
                  {!isBuyer && order.shipment_status === 'pending' && (
                    <button 
                      onClick={() => handleShipOrder(order.id)}
                      className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
                    >
                      Mark as Shipped
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {myOrders.length === 0 && (
            <div className="py-20 bg-zinc-50 rounded-[3rem] border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-500">
              <History className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold">No activity found yet.</p>
            </div>
          )}
        </div>
      )}

      {/* Add Product Modal */}
      <AnimatePresence>
        {isAddingProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl border border-zinc-100 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-zinc-900 via-zinc-500 to-zinc-900"></div>
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">List New Item</h3>
                  <p className="text-sm text-zinc-500">Share something with the community</p>
                </div>
                <button 
                  onClick={() => setIsAddingProduct(false)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <AlertCircle className="w-5 h-5 text-zinc-400 rotate-45" />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                try {
                  let appId = undefined;
                  if (isAuctionForm) {
                    setPurchaseStatus("Deploying auction contract...");
                    appId = await startAuctionOnChain(
                      accountAddress!,
                      parseFloat(formData.get('price') as string),
                      24 // 24 hours
                    );
                  }

                  const productData = {
                    name: formData.get('name') as string,
                    description: formData.get('description') as string,
                    price: parseFloat(formData.get('price') as string),
                    category: formData.get('category') as string,
                    image_url: formData.get('image_url') as string,
                    is_auction: isAuctionForm,
                    app_id: appId,
                    starting_price: isAuctionForm ? parseFloat(formData.get('price') as string) : undefined,
                    auction_end: isAuctionForm ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : undefined,
                    seller_address: accountAddress,
                    quantity: isAuctionForm ? 1 : (parseInt(formData.get('quantity') as string) || 1)
                  };

                  const response = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(productData)
                  });
                  if (!response.ok) throw new Error("Failed to list product");
                  alert("Product listed successfully!");
                  setIsAddingProduct(false);
                  setIsAuctionForm(false);
                  loadData();
                } catch (err: any) {
                  alert(err.message);
                } finally {
                  setPurchaseStatus("");
                }
              }} className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl mb-2">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg", isAuctionForm ? "bg-zinc-900 text-white" : "bg-white text-zinc-400 border border-zinc-100")}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-900">List as Auction</p>
                      <p className="text-[10px] text-zinc-500">Allow bidding for 24 hours</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsAuctionForm(!isAuctionForm)}
                    className={cn("w-12 h-6 rounded-full p-1 transition-all", isAuctionForm ? "bg-zinc-900" : "bg-zinc-200")}
                  >
                    <motion.div 
                      animate={{ x: isAuctionForm ? 24 : 0 }}
                      className="w-4 h-4 bg-white rounded-full shadow-sm"
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Item Name</label>
                  <input name="name" required placeholder="What are you selling?" className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 transition-all" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">
                      {isAuctionForm ? "Starting Price" : "Price"} (ALGO)
                    </label>
                    <input name="price" type="number" step="0.1" required placeholder="0.00" className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Category</label>
                    <select name="category" className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 focus:ring-2 focus:ring-zinc-900 transition-all appearance-none">
                      <option>Electronics</option>
                      <option>Books</option>
                      <option>Clothing</option>
                      <option>Services</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                {!isAuctionForm && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Quantity</label>
                    <input name="quantity" type="number" min="1" defaultValue="1" required className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 focus:ring-2 focus:ring-zinc-900 transition-all" />
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Description</label>
                  <textarea name="description" required placeholder="Describe your item..." rows={3} className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 transition-all resize-none" />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Image URL</label>
                  <input name="image_url" placeholder="https://..." className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 transition-all" />
                </div>

                <div className="pt-4">
                  <button type="submit" className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200">
                    Post Listing
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checkout Modal */}
      <AnimatePresence>
        {showCheckoutModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-md shadow-2xl border border-zinc-100 relative"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Checkout</h3>
                  <p className="text-sm text-zinc-500">Review your order details</p>
                </div>
                <button 
                  onClick={() => setShowCheckoutModal(null)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <Plus className="w-5 h-5 text-zinc-400 rotate-45" />
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl">
                  <img src={showCheckoutModal.image_url} alt="" className="w-16 h-16 rounded-xl object-cover" />
                  <div className="flex-1">
                    <h4 className="font-bold text-zinc-900">{showCheckoutModal.name}</h4>
                    <p className="text-sm text-zinc-500">{showCheckoutModal.price} ALGO</p>
                  </div>
                  {showCheckoutModal.quantity > 1 && (
                    <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-zinc-100">
                      <button 
                         onClick={() => setPurchaseQuantity(Math.max(1, purchaseQuantity - 1))}
                         className="w-6 h-6 flex items-center justify-center bg-zinc-50 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors"
                      >-</button>
                      <span className="text-xs font-bold w-4 text-center">{purchaseQuantity}</span>
                      <button 
                         onClick={() => setPurchaseQuantity(Math.min(showCheckoutModal.quantity, purchaseQuantity + 1))}
                         className="w-6 h-6 flex items-center justify-center bg-zinc-50 rounded-lg text-zinc-400 hover:text-zinc-900 transition-colors"
                      >+</button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Total Amount</span>
                  <span className="text-xl font-black text-zinc-900">
                    {paymentCurrency === "ALGO" 
                      ? `${Number(showCheckoutModal.price) * purchaseQuantity} ALGO`
                      : `${Number(showCheckoutModal.price) * purchaseQuantity} USDC`}
                  </span>
                </div>

                <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-xl mb-4">
                  <button 
                    onClick={() => setPaymentCurrency("ALGO")}
                    className={cn("flex-1 py-2 rounded-lg text-[10px] font-bold transition-all", paymentCurrency === "ALGO" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                  >
                    ALGO
                  </button>
                  <button 
                    onClick={() => setPaymentCurrency("USDC")}
                    className={cn("flex-1 py-2 rounded-lg text-[10px] font-bold transition-all", paymentCurrency === "USDC" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500")}
                  >
                    USDC
                  </button>
                </div>

                <div className="p-4 bg-zinc-50 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-lg", isSplitPurchase ? "bg-zinc-900 text-white" : "bg-white text-zinc-400")}>
                        <Users className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-bold text-zinc-900">Split this Expense</span>
                    </div>
                    <button 
                      onClick={() => setIsSplitPurchase(!isSplitPurchase)}
                      className={cn("w-10 h-5 rounded-full p-1 transition-all", isSplitPurchase ? "bg-zinc-900" : "bg-zinc-200")}
                    >
                      <motion.div 
                        animate={{ x: isSplitPurchase ? 20 : 0 }}
                        className="w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>

                  {isSplitPurchase && (
                    <div className="pt-2">
                      <select 
                        value={selectedSplitGroup || ""}
                        onChange={(e) => setSelectedSplitGroup(Number(e.target.value))}
                        className="w-full px-4 py-3 bg-white border border-zinc-100 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 transition-all outline-none"
                      >
                        <option value="">Select Expense Group</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      {groups.length === 0 && (
                        <p className="text-[10px] text-red-500 mt-2 ml-1">No groups found. Create one in Split Expenses first.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <button 
                onClick={() => handleBuy(showCheckoutModal)}
                disabled={isBuying !== null || (isSplitPurchase && !selectedSplitGroup)}
                className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 disabled:opacity-50"
              >
                {isBuying === showCheckoutModal.id ? purchaseStatus || "Processing..." : "Confirm Purchase"}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bid Modal */}
      <AnimatePresence>
        {showBidModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl border border-zinc-100 relative"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Place Bid</h3>
                  <p className="text-sm text-zinc-500">Highest Bid: {showBidModal.starting_price} ALGO</p>
                </div>
                <button 
                  onClick={() => setShowBidModal(null)}
                  className="p-2 hover:bg-zinc-100 rounded-full transition-colors"
                >
                  <Plus className="w-5 h-5 text-zinc-400 rotate-45" />
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Your Bid Amount</label>
                  <input 
                    type="number"
                    step="0.01"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    placeholder={`Must be > ${showBidModal.starting_price}`}
                    className="w-full px-5 py-4 bg-zinc-50 border-none rounded-2xl text-zinc-900 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-900 transition-all text-center text-xl font-black"
                  />
                </div>
              </div>

              <button 
                onClick={() => {
                  handlePlaceBid(showBidModal.id, parseFloat(bidAmount));
                  setShowBidModal(null);
                }}
                disabled={!bidAmount || parseFloat(bidAmount) <= (showBidModal.starting_price || 0)}
                className="w-full py-5 bg-zinc-900 text-white rounded-2xl font-bold text-base hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 disabled:opacity-50"
              >
                Confirm Bid
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
