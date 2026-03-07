import React, { useState, useEffect, useCallback } from "react";
import { 
  Target, 
  Plus, 
  TrendingUp, 
  Calendar, 
  Award, 
  ArrowUpRight, 
  Loader2, 
  CheckCircle2,
  Wallet,
  History
} from "lucide-react";
import { 
  SavingsGoal, 
  SavingsDeposit, 
  getSavingsGoals, 
  createSavingsGoal, 
  getSavingsDeposits, 
  createSavingsDeposit,
  algodClient,
  peraWallet,
  formatAlgo,
  SAVINGS_VAULT_ADDRESS
} from "../services/algorandService";
import algosdk from "algosdk";
import { cn } from "../lib/utils";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { motion } from "motion/react";

interface SavingsGoalsProps {
  accountAddress: string;
  onRefreshBalance: () => void;
}

export default function SavingsGoals({ accountAddress, onRefreshBalance }: SavingsGoalsProps) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<SavingsGoal | null>(null);
  const [deposits, setDeposits] = useState<SavingsDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositStatus, setDepositStatus] = useState("");

  // Form State
  const [goalName, setGoalName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [deadline, setDeadline] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  const loadGoals = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSavingsGoals(accountAddress);
      setGoals(data);
    } catch (error) {
      console.error("Failed to load goals", error);
    } finally {
      setIsLoading(false);
    }
  }, [accountAddress]);

  const loadDeposits = useCallback(async (goalId: string) => {
    try {
      const data = await getSavingsDeposits(goalId);
      setDeposits(data);
    } catch (error) {
      console.error("Failed to load deposits", error);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  useEffect(() => {
    if (selectedGoal) {
      loadDeposits(selectedGoal.id);
    }
  }, [selectedGoal, loadDeposits]);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await createSavingsGoal({
        user_address: accountAddress,
        name: goalName,
        target_amount: parseFloat(targetAmount),
        deadline: deadline
      });
      setGoalName("");
      setTargetAmount("");
      setDeadline("");
      setIsCreating(false);
      loadGoals();
    } catch (error) {
      alert("Failed to create goal");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGoal) return;

    setIsDepositing(true);
    setDepositStatus("Initializing...");

    try {
      // 1. Get Network Params
      setDepositStatus("Fetching network params...");
      const suggestedParams = await algodClient.getTransactionParams().do();
      
      // 2. Construct Transaction (Send to Vault)
      const amountInMicroAlgos = Math.round(parseFloat(depositAmount) * 1_000_000);
      
      const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver: SAVINGS_VAULT_ADDRESS.trim(),
        amount: BigInt(amountInMicroAlgos),
        suggestedParams: suggestedParams,
      });

      // 3. Sign Transaction
      setDepositStatus("Waiting for signature...");
      const txnGroup = [{ txn, signers: [accountAddress] }];
      const signedTxns = await peraWallet.signTransaction([txnGroup]);
      
      // 4. Send Transaction
      setDepositStatus("Broadcasting...");
      const response = await algodClient.sendRawTransaction(signedTxns).do();
      const txId = (response as any).txId || (response as any).txid;
      
      // 5. Wait for Confirmation
      setDepositStatus("Confirming on-chain...");
      await algosdk.waitForConfirmation(algodClient, txId, 4);
      
      // 6. Update Backend
      setDepositStatus("Finalizing...");
      await createSavingsDeposit({
        goal_id: selectedGoal.id,
        user_address: accountAddress,
        amount: parseFloat(depositAmount),
        tx_id: txId
      });

      setDepositAmount("");
      setDepositStatus("Success!");
      alert("Deposit recorded successfully!");
      onRefreshBalance();
      loadGoals();
      if (selectedGoal) loadDeposits(selectedGoal.id);
    } catch (error: any) {
      console.error("Deposit failed", error);
      alert("Deposit failed: " + (error.message || "Unknown error"));
    } finally {
      setIsDepositing(false);
      setDepositStatus("");
    }
  };

  const chartData = deposits.reduce((acc: any[], dep) => {
    const prevAmount = acc.length > 0 ? acc[acc.length - 1].amount : 0;
    acc.push({
      date: new Date(dep.created_at).toLocaleDateString(),
      amount: prevAmount + dep.amount
    });
    return acc;
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">Savings Goals</h2>
          <p className="text-zinc-500">Set targets, save ALGO, and track your progress on-chain.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-900/10"
        >
          <Plus className="w-5 h-5" />
          Create New Goal
        </button>
      </div>

      {isCreating && (
        <div className="bg-white border border-zinc-200 rounded-[2.5rem] p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">New Savings Goal</h3>
            <button onClick={() => setIsCreating(false)} className="text-zinc-400 hover:text-zinc-600">
              <Plus className="w-6 h-6 rotate-45" />
            </button>
          </div>
          <form onSubmit={handleCreateGoal} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Goal Name</label>
              <input 
                type="text" 
                value={goalName}
                onChange={(e) => setGoalName(e.target.value)}
                placeholder="e.g. New Laptop"
                className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Target Amount (ALGO)</label>
              <input 
                type="number" 
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-bold"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Deadline</label>
              <input 
                type="date" 
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-medium"
                required
              />
            </div>
            <button 
              type="submit"
              disabled={isLoading}
              className="md:col-span-3 py-4 rounded-2xl bg-zinc-900 text-white font-bold hover:bg-zinc-800 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Target className="w-5 h-5" />}
              Start Saving
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Goals List */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest ml-1">Active Goals</h3>
          <div className="space-y-3">
            {goals.length === 0 ? (
              <div className="p-12 text-center bg-zinc-50 rounded-[2rem] border border-dashed border-zinc-200">
                <Target className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">No savings goals yet.</p>
              </div>
            ) : (
              goals.map(goal => {
                const progress = Math.min((goal.current_amount / goal.target_amount) * 100, 100);
                return (
                  <button
                    key={goal.id}
                    onClick={() => setSelectedGoal(goal)}
                    className={cn(
                      "w-full p-6 rounded-[2rem] border transition-all text-left space-y-4",
                      selectedGoal?.id === goal.id 
                        ? "bg-zinc-900 text-white border-zinc-900 shadow-xl shadow-zinc-900/20" 
                        : "bg-white text-zinc-900 border-zinc-200 hover:border-zinc-400"
                    )}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h4 className="font-bold truncate max-w-[150px]">{goal.name}</h4>
                        <p className={cn(
                          "text-[10px] font-bold uppercase tracking-widest",
                          selectedGoal?.id === goal.id ? "text-zinc-400" : "text-zinc-500"
                        )}>
                          Target: {goal.target_amount} ALGO
                        </p>
                      </div>
                      {goal.status === 'completed' && <Award className="w-5 h-5 text-emerald-400" />}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span>{progress.toFixed(1)}%</span>
                        <span>{goal.current_amount.toFixed(2)} / {goal.target_amount}</span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-100/20 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          className={cn(
                            "h-full rounded-full",
                            selectedGoal?.id === goal.id ? "bg-white" : "bg-zinc-900"
                          )}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Goal Detail & Analytics */}
        <div className="lg:col-span-2 space-y-6">
          {selectedGoal ? (
            <div className="bg-white border border-zinc-200 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-zinc-100 rounded-2xl flex items-center justify-center text-zinc-900">
                    <Target className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-zinc-900">{selectedGoal.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-zinc-500">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Ends {new Date(selectedGoal.deadline).toLocaleDateString()}</span>
                      <span className="w-1 h-1 bg-zinc-300 rounded-full" />
                      <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> {selectedGoal.status}</span>
                    </div>
                  </div>
                </div>
                
                <form onSubmit={handleDeposit} className="flex gap-2">
                  <div className="relative">
                    <input 
                      type="number" 
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-32 px-4 py-3 rounded-xl border border-zinc-200 focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-bold text-sm"
                      required
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-bold text-zinc-400">ALGO</span>
                  </div>
                  <button 
                    type="submit"
                    disabled={isDepositing}
                    className="px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    {isDepositing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-[10px]">{depositStatus}</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-4 h-4" />
                        Deposit
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Analytics Chart */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Savings Progress</h4>
                  <div className="flex items-center gap-4 text-[10px] font-bold">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-900" />
                      <span>Balance</span>
                    </div>
                  </div>
                </div>
                <div className="h-[250px] w-full">
                  {deposits.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#a1a1aa' }} 
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#a1a1aa' }} 
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: '16px', 
                            border: 'none', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                            fontSize: '12px'
                          }} 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="amount" 
                          stroke="#18181b" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorAmount)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center bg-zinc-50 rounded-3xl border border-dashed border-zinc-200 text-zinc-400">
                      <TrendingUp className="w-8 h-8 mb-2 opacity-20" />
                      <p className="text-xs">No deposit history yet.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deposit History */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-widest">Recent Contributions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {deposits.slice().reverse().map(dep => (
                    <div key={dep.id} className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-emerald-500 shadow-sm">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-zinc-900">+{dep.amount} ALGO</p>
                          <p className="text-[10px] text-zinc-400">{new Date(dep.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <a 
                        href={`https://testnet.explorer.perawallet.app/tx/${dep.tx_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-zinc-200 text-zinc-400 transition-colors"
                      >
                        <History className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 bg-white border border-zinc-200 rounded-[2.5rem] space-y-4 text-center">
              <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center text-zinc-200">
                <Target className="w-10 h-10" />
              </div>
              <div className="space-y-1">
                <p className="font-bold text-zinc-900">Select a goal to view progress</p>
                <p className="text-sm text-zinc-400">Track your savings journey and visualize your growth.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Achievement Badges */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest ml-1">Achievements</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className={cn(
            "p-6 rounded-3xl border text-center space-y-3 transition-all",
            goals.length > 0 ? "bg-white border-zinc-200 shadow-sm" : "bg-zinc-50 border-transparent opacity-40"
          )}>
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest">First Goal</p>
          </div>
          <div className={cn(
            "p-6 rounded-3xl border text-center space-y-3 transition-all",
            goals.some(g => g.current_amount > 0) ? "bg-white border-zinc-200 shadow-sm" : "bg-zinc-50 border-transparent opacity-40"
          )}>
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto">
              <Wallet className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest">First Saver</p>
          </div>
          <div className={cn(
            "p-6 rounded-3xl border text-center space-y-3 transition-all",
            goals.some(g => g.status === 'completed') ? "bg-white border-zinc-200 shadow-sm" : "bg-zinc-50 border-transparent opacity-40"
          )}>
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
              <Award className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest">Goal Reached</p>
          </div>
        </div>
      </div>
    </div>
  );
}
