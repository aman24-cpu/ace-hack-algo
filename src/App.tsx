/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Wallet, 
  Send, 
  History, 
  QrCode, 
  Copy, 
  Check, 
  ArrowUpRight, 
  ArrowDownLeft, 
  RefreshCw,
  LogOut,
  ExternalLink,
  Coins,
  Search,
  User,
  GraduationCap,
  CreditCard,
  Bell,
  Settings,
  ChevronRight,
  Store,
  ShoppingBag,
  TrendingUp,
  Briefcase,
  Users,
  Sparkles,
  ArrowRight
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Marketplace from "./components/Marketplace";
import SplitExpenses from "./components/SplitExpenses";
import { CampusGigs } from "./components/CampusGigs";
import { 
  algodClient, 
  getAccountInfo, 
  getTransactionHistory, 
  formatAlgo,
  AccountInfo,
  Transaction,
  peraWallet
} from "./services/algorandService";
import { cn } from "./lib/utils";
import algosdk from "algosdk";
import { ShootingStars } from "./components/ui/shooting-stars";
import { Header } from "./components/ui/header-3";

export default function App() {
  const [accountAddress, setAccountAddress] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "marketplace" | "gigs" | "split" | "send" | "receive" | "history">("dashboard");
  const [showLanding, setShowLanding] = useState(true);

  // Send Form State
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{id: string, message: string, type: 'info' | 'success'}[]>([]);

  const addNotification = (message: string, type: 'info' | 'success' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const fetchAccountData = useCallback(async (address: string) => {
    try {
      const info = await getAccountInfo(address);
      setAccountInfo(info);
      const history = await getTransactionHistory(address);
      setTransactions(history);
    } catch (error) {
      console.error("Error fetching account data:", error);
    }
  }, []);

  useEffect(() => {
    peraWallet.reconnectSession().then((accounts) => {
      if (accounts.length > 0) {
        setAccountAddress(accounts[0]);
        fetchAccountData(accounts[0]);
      }
    });
  }, [fetchAccountData]);

  useEffect(() => {
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = (event as ErrorEvent).error || (event as PromiseRejectionEvent).reason;
      const stack = error?.stack || "No stack trace";
      console.error("GLOBAL ERROR CAPTURED:", error);
      // Only alert if it's the specific error we're hunting
      if (stack.includes("publicKey") || (error?.message && error.message.includes("publicKey"))) {
        console.error("CRITICAL PUBLICKEY ERROR:", error.message, stack);
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
    };
  }, []);

  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectWallet = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    
    try {
      const accounts = await peraWallet.connect();
      if (accounts.length > 0) {
        const address = accounts[0];
        setAccountAddress(address);
        fetchAccountData(address);
      }
    } catch (error: any) {
      console.error("Connection error:", error);
      if (error?.message !== "The UI was closed by the user.") {
        alert("Connection failed. Please ensure your Pera Wallet is open and on Testnet.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectWallet = async () => {
    await peraWallet.disconnect();
    setAccountAddress(null);
    setAccountInfo(null);
    setTransactions([]);
    setActiveTab("dashboard");
  };

  const handleRefresh = async () => {
    if (!accountAddress) return;
    setIsRefreshing(true);
    await fetchAccountData(accountAddress);
    setIsRefreshing(false);
    addNotification("Dashboard updated", "info");
  };

  const handleCopyAddress = () => {
    if (!accountAddress) return;
    navigator.clipboard.writeText(accountAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountAddress || !recipient || !amount) return;

    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const suggestedParams = await algodClient.getTransactionParams().do();
      const amountInMicroAlgos = Math.round(parseFloat(amount) * 1_000_000);
      
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver: recipient.trim(),
        amount: BigInt(amountInMicroAlgos),
        suggestedParams: suggestedParams,
      });

      const singleTxnGroups = [{ txn, signers: [accountAddress] }];
      const signedTxns = await peraWallet.signTransaction([singleTxnGroups]);
      const response = await algodClient.sendRawTransaction(signedTxns).do();
      const txId = (response as any).txId || (response as any).txid;
      
      await algosdk.waitForConfirmation(algodClient, txId, 4);
      
      setSendSuccess(`Success! ID: ${txId.slice(0, 8)}...`);
      setRecipient("");
      setAmount("");
      fetchAccountData(accountAddress);
    } catch (error: any) {
      console.error("Transaction failed:", error);
      setSendError(error.message || "Transaction failed.");
    } finally {
      setIsSending(false);
    }
  };


  const LandingPage = () => (
    <div className="fixed inset-0 z-[200] bg-black overflow-hidden select-none">
      {/* Background Stars - Static + Twinkle */}
      <div className="absolute inset-0 stars-background opacity-40" />
      
      {/* Dynamic Shooting Stars */}
      <ShootingStars 
        starColor="#FF0000" 
        trailColor="#FFB800" 
        minSpeed={15} 
        maxSpeed={35} 
        minDelay={1000}
        maxDelay={3000}
      />
      <ShootingStars 
        starColor="#FF0099" 
        trailColor="#FF0000" 
        minSpeed={10} 
        maxSpeed={25} 
        minDelay={2000}
        maxDelay={4000}
      />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="space-y-6"
        >
          <h1 className="text-5xl md:text-7xl font-black text-white tracking-tighter">
            Welcome to <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">Campus Pay</span>
          </h1>
          <p className="max-w-xl mx-auto text-zinc-400 text-lg md:text-xl font-medium">
            The ultimate decentralized ecosystem for student life. Earn, spend, and split ALGO with ease.
          </p>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowLanding(false)}
            className="bg-white text-zinc-900 px-12 py-6 md:px-16 md:py-8 rounded-[2rem] font-black text-xl md:text-2xl shadow-2xl hover:bg-zinc-100 transition-all flex items-center justify-center gap-4 mx-auto group mt-12"
          >
            Get Started
            <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
          </motion.button>
          
          <div className="flex justify-center gap-8 pt-16 opacity-60">
              <div className="text-center">
                <p className="text-2xl font-black text-white leading-tight">100%</p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Decentralized</p>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center">
                <p className="text-2xl font-black text-white leading-tight">0.001</p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">ALGO Fee</p>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-center">
                <p className="text-2xl font-black text-white leading-tight">Instant</p>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Payouts</p>
              </div>
          </div>
        </motion.div>
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      <AnimatePresence>
        {showLanding && (
          <motion.div
            key="landing"
            exit={{ y: "-100%", opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.76, 0, 0.24, 1] }}
            className="fixed inset-0 z-[500]"
          >
            <LandingPage />
          </motion.div>
        )}
      </AnimatePresence>

      <Header 
        activeTab={activeTab as any} 
        setActiveTab={setActiveTab} 
        accountAddress={accountAddress} 
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 p-6 md:p-10 overflow-auto">
          {!accountAddress ? (
            <div className="h-full flex flex-col items-center justify-center max-w-md mx-auto text-center space-y-6">
              <div className="w-24 h-24 bg-zinc-900 rounded-[2.5rem] flex items-center justify-center shadow-2xl rotate-3">
                <Wallet className="w-10 h-10 text-white" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">The Future of Campus Payments</h2>
                <p className="text-zinc-500">Secure, instant, and built for students. Connect your wallet to enter the campus ecosystem.</p>
              </div>
              <button 
                onClick={handleConnectWallet}
                disabled={isConnecting}
                className="w-full py-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition-all shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-3"
              >
                {isConnecting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Wallet className="w-5 h-5" />}
                {isConnecting ? "Connecting..." : "Connect Pera Wallet"}
              </button>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-8">
              <AnimatePresence mode="wait">
                {activeTab === "dashboard" && (
                  <motion.div
                    key="dashboard"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                  >
                    {/* Left Column: Balance & ID */}
                    <div className="lg:col-span-2 space-y-8">
                      {/* Balance Card */}
                      <div className="bg-zinc-900 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
                        <div className="absolute -right-10 -top-10 opacity-10">
                          <Coins className="w-64 h-64" />
                        </div>
                        <div className="relative z-10 space-y-8">
                          <div className="flex justify-between items-start">
                            <div className="space-y-1">
                              <p className="text-zinc-400 text-xs font-bold uppercase tracking-widest">Total Balance</p>
                              <div className="flex items-baseline gap-2">
                                <h3 className="text-5xl font-bold tracking-tighter">
                                  {accountInfo ? formatAlgo(accountInfo.amount) : "0.00"}
                                </h3>
                                <span className="text-xl font-medium text-zinc-400">ALGO</span>
                              </div>
                            </div>
                            <button 
                              onClick={handleRefresh}
                              className={cn("p-3 rounded-2xl bg-white/10 hover:bg-white/20 transition-all", isRefreshing && "animate-spin")}
                            >
                              <RefreshCw className="w-5 h-5" />
                            </button>
                          </div>
                          
                          <div className="flex items-center gap-4 pt-4">
                            <button 
                              onClick={() => setActiveTab("send")}
                              className="flex-1 bg-white text-zinc-900 py-3 rounded-xl font-bold text-sm hover:bg-zinc-100 transition-all"
                            >
                              Send
                            </button>
                            <button 
                              onClick={() => setActiveTab("receive")}
                              className="flex-1 bg-white/10 text-white py-3 rounded-xl font-bold text-sm hover:bg-white/20 transition-all"
                            >
                              Receive
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Student ID Simulation */}
                      <div className="bg-white border border-zinc-200 rounded-[2rem] p-8 shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 top-0 w-32 h-full bg-zinc-50 -skew-x-12 translate-x-16 group-hover:translate-x-12 transition-transform duration-700" />
                        <div className="relative z-10 flex gap-6">
                          <div className="w-24 h-24 bg-zinc-100 rounded-2xl flex items-center justify-center shrink-0">
                            <User className="w-10 h-10 text-zinc-300" />
                          </div>
                          <div className="flex-1 space-y-4">
                            <div className="space-y-1">
                              <h4 className="text-xl font-bold text-zinc-900">Student ID Card</h4>
                              <p className="text-sm text-zinc-500">Verified Web3 Identity</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</p>
                                <p className="text-sm font-bold text-emerald-500">Active</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Network</p>
                                <p className="text-sm font-bold text-zinc-900">Testnet</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Quick Actions & Recent */}
                    <div className="space-y-8">
                      <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm space-y-6">
                        <h4 className="text-sm font-bold text-zinc-900 px-2">Quick Actions</h4>
                        <div className="space-y-2">
                          <button 
                            onClick={() => setActiveTab("marketplace")}
                            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-zinc-50 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-orange-50 text-orange-500 rounded-xl flex items-center justify-center">
                                <Store className="w-5 h-5" />
                              </div>
                              <span className="text-sm font-bold text-zinc-700">Campus Store</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                          </button>
                          <button 
                            onClick={() => setActiveTab("gigs")}
                            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-zinc-50 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-purple-50 text-purple-500 rounded-xl flex items-center justify-center">
                                <Briefcase className="w-5 h-5" />
                              </div>
                              <span className="text-sm font-bold text-zinc-700">Campus Gigs</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                          </button>
                          <button 
                            onClick={() => setActiveTab("split")}
                            className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-zinc-50 transition-all group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
                                <Users className="w-5 h-5" />
                              </div>
                              <span className="text-sm font-bold text-zinc-700">Split Expenses</span>
                            </div>
                            <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm space-y-6">
                        <div className="flex justify-between items-center px-2">
                          <h4 className="text-sm font-bold text-zinc-900">Recent Activity</h4>
                          <button onClick={() => setActiveTab("history")} className="text-xs font-bold text-zinc-400 hover:text-zinc-900">View All</button>
                        </div>
                        <div className="space-y-4">
                          {transactions.slice(0, 3).map(tx => {
                            const isSent = tx.sender === accountAddress;
                            return (
                              <div key={tx.id} className="flex items-center gap-3">
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", isSent ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500")}>
                                  {isSent ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-zinc-900 truncate">
                                    {isSent ? `To: ${tx.receiver.slice(0, 6)}...` : `From: ${tx.sender.slice(0, 6)}...`}
                                  </p>
                                  <p className="text-[10px] text-zinc-400">{new Date(tx.timestamp).toLocaleDateString()}</p>
                                </div>
                                <p className={cn("text-xs font-bold", isSent ? "text-red-500" : "text-emerald-500")}>
                                  {isSent ? "-" : "+"}{formatAlgo(tx.amount)}
                                </p>
                              </div>
                            );
                          })}
                          {transactions.length === 0 && <p className="text-center text-xs text-zinc-400 py-4">No recent activity</p>}
                        </div>
                      </div>

                      <div className="bg-white border border-zinc-200 rounded-[2rem] p-6 shadow-sm space-y-6 overflow-hidden relative">
                         <div className="absolute top-0 right-0 w-24 h-24 bg-zinc-50 rounded-full -translate-y-12 translate-x-12 opacity-50" />
                         <h4 className="text-sm font-bold text-zinc-900 px-2 flex items-center gap-2">
                           <TrendingUp className="w-4 h-4 text-emerald-500" />
                           Top App Sellers
                         </h4>
                         <div className="space-y-4 relative z-10">
                            {[
                               { addr: "PYFZQHIS...FJMZUI", vol: 450 },
                               { addr: "A7H2B4K9...L3M8N1", vol: 280 },
                               { addr: "ZK9P0O1I...Q2W3E4", vol: 150 }
                            ].map((s, i) => (
                              <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 rounded-xl">
                                <span className="text-xs font-mono font-bold text-zinc-600 truncate max-w-[120px]">{s.addr}</span>
                                <span className="text-xs font-black text-zinc-900">{s.vol} ALGO</span>
                              </div>
                            ))}
                         </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "marketplace" && (
                  <motion.div
                    key="marketplace"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <Marketplace 
                      accountAddress={accountAddress} 
                      onRefreshBalance={handleRefresh}
                    />
                  </motion.div>
                )}

                {activeTab === "gigs" && (
                  <motion.div
                    key="gigs"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <CampusGigs 
                      accountAddress={accountAddress} 
                    />
                  </motion.div>
                )}

                {activeTab === "split" && (
                  <motion.div
                    key="split"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <SplitExpenses 
                      accountAddress={accountAddress} 
                    />
                  </motion.div>
                )}

                {activeTab === "send" && (
                  <motion.div
                    key="send"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="max-w-xl mx-auto bg-white border border-zinc-200 rounded-[2.5rem] p-8 md:p-12 shadow-sm space-y-8"
                  >
                    <div className="text-center space-y-2">
                      <div className="w-16 h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                        <Send className="w-8 h-8" />
                      </div>
                      <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Send Payment</h3>
                      <p className="text-zinc-500">Transfer ALGO instantly to any student or merchant.</p>
                    </div>

                    <form onSubmit={handleSendTransaction} className="space-y-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Recipient Address</label>
                        <input 
                          type="text"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          placeholder="Paste address or select from directory"
                          className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-mono text-sm"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Amount</label>
                        <div className="relative">
                          <input 
                            type="number"
                            step="0.000001"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all text-2xl font-bold tracking-tight"
                            required
                          />
                          <div className="absolute right-5 top-1/2 -translate-y-1/2 font-bold text-zinc-400">ALGO</div>
                        </div>
                      </div>

                      {sendError && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium border border-red-100">{sendError}</div>}
                      {sendSuccess && <div className="p-4 bg-emerald-50 text-emerald-700 rounded-2xl text-sm font-medium border border-emerald-100">{sendSuccess}</div>}

                      <button 
                        type="submit"
                        disabled={isSending}
                        className="w-full py-5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition-all shadow-xl shadow-zinc-900/20 flex items-center justify-center gap-3 disabled:opacity-50"
                      >
                        {isSending ? <RefreshCw className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                        {isSending ? "Processing..." : "Confirm Payment"}
                      </button>
                    </form>
                  </motion.div>
                )}

                {activeTab === "receive" && (
                  <motion.div
                    key="receive"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="max-w-xl mx-auto bg-white border border-zinc-200 rounded-[2.5rem] p-12 shadow-sm flex flex-col items-center text-center space-y-10"
                  >
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Your QR Code</h3>
                      <p className="text-zinc-500">Show this to others to receive payments.</p>
                    </div>

                    <div className="p-8 bg-white border-4 border-zinc-50 rounded-[3rem] shadow-inner relative group">
                      <QRCodeSVG 
                        value={accountAddress} 
                        size={240}
                        level="H"
                        className="rounded-xl"
                      />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 backdrop-blur-sm rounded-[3rem]">
                        <button onClick={handleCopyAddress} className="bg-zinc-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-xl">
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? "Copied!" : "Copy Address"}
                        </button>
                      </div>
                    </div>

                    <div className="w-full space-y-4">
                      <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100 font-mono text-xs text-zinc-500 break-all">
                        {accountAddress}
                      </div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Algorand Testnet Address</p>
                    </div>
                  </motion.div>
                )}

                {activeTab === "history" && (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-6"
                  >
                    <div className="flex justify-between items-end">
                      <div className="space-y-1">
                        <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Transaction History</h3>
                        <p className="text-sm text-zinc-500">Your recent campus activity.</p>
                      </div>
                      <button 
                        onClick={handleRefresh}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-zinc-200 text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-all"
                      >
                        <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
                        Refresh
                      </button>
                    </div>

                    <div className="bg-white border border-zinc-200 rounded-[2rem] overflow-hidden shadow-sm">
                      {transactions.length > 0 ? (
                        <div className="divide-y divide-zinc-100">
                          {transactions.map(tx => {
                            const isSent = tx.sender === accountAddress;
                            return (
                              <div key={tx.id} className="p-6 flex items-center gap-6 hover:bg-zinc-50 transition-all group">
                                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", isSent ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-500")}>
                                  {isSent ? <ArrowUpRight className="w-6 h-6" /> : <ArrowDownLeft className="w-6 h-6" />}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex justify-between items-start">
                                    <p className="font-bold text-zinc-900 truncate">
                                      {isSent ? `Transfer to ${tx.receiver.slice(0, 12)}...` : `Received from ${tx.sender.slice(0, 12)}...`}
                                    </p>
                                    <p className={cn("text-lg font-bold", isSent ? "text-red-500" : "text-emerald-500")}>
                                      {isSent ? "-" : "+"}{formatAlgo(tx.amount)} ALGO
                                    </p>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                                      <span>{new Date(tx.timestamp).toLocaleDateString()}</span>
                                      <span>•</span>
                                      <span>{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <a 
                                      href={`https://testnet.explorer.perawallet.app/tx/${tx.id}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs font-bold text-zinc-300 group-hover:text-zinc-900 transition-colors"
                                    >
                                      Explorer <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                          <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center">
                            <History className="w-10 h-10 text-zinc-200" />
                          </div>
                          <div className="space-y-1">
                            <p className="font-bold text-zinc-900">No transactions yet</p>
                            <p className="text-sm text-zinc-400">Your history will appear here once you start paying.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </main>

      {/* Notifications Toast */}
      <div className="fixed top-20 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={cn(
                "p-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[280px] pointer-events-auto backdrop-blur-md",
                n.type === 'success' ? "bg-emerald-500/90 text-white border-emerald-400" : "bg-white/90 text-zinc-900 border-zinc-100"
              )}
            >
              {n.type === 'success' ? <Check className="w-5 h-5" /> : <Bell className="w-5 h-5 text-zinc-400" />}
              <span className="text-sm font-bold">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
