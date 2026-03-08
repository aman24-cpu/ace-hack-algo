import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Briefcase, 
  Plus, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  User, 
  DollarSign,
  FileText,
  Send,
  Loader2,
  X,
  Star
} from "lucide-react";
import { 
  GigTask, 
  getTasks, 
  createGigTask, 
  claimTask, 
  submitProof, 
  approveTask, 
  payoutMilestone,
  rateWorkerOnChain,
  getMyTasks,
  peraWallet,
  algodClient,
  formatAlgo
} from "../services/algorandService";
import algosdk from "algosdk";
import { cn } from "../lib/utils";

interface CampusGigsProps {
  accountAddress: string;
}

export const CampusGigs: React.FC<CampusGigsProps> = ({ accountAddress }) => {
  const [tasks, setTasks] = useState<GigTask[]>([]);
  const [myTasks, setMyTasks] = useState<GigTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'board' | 'my-gigs'>('board');
  const [isPosting, setIsPosting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Form State
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newReward, setNewReward] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [postStatus, setPostStatus] = useState("");
  const [newMilestones, setNewMilestones] = useState<{title: string, percentage: number}[]>([]);

  // Action State
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [showProofModal, setShowProofModal] = useState<string | null>(null);

  const handleRateWorker = async (task: GigTask, rating: number) => {
    try {
      setProcessingId(task.id);
      console.log(`Rating worker on-chain...`);
      await rateWorkerOnChain(task, accountAddress, rating);
      
      const response = await fetch(`/api/tasks/${task.id}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, creator_address: accountAddress }),
      });
      if (!response.ok) throw new Error("Failed to submit rating to database");
      alert("Rating submitted on-chain!");
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const StarRating: React.FC<{ rating: number; onRate?: (r: number) => void; size?: number }> = ({ rating, onRate, size = 4 }) => {
    const [hover, setHover] = useState(0);
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!onRate}
            onMouseEnter={() => onRate && setHover(star)}
            onMouseLeave={() => onRate && setHover(0)}
            onClick={() => onRate && onRate(star)}
            className={cn(
              "transition-all duration-200",
              onRate ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default"
            )}
          >
            <Star 
              className={cn(
                `w-${size} h-${size}`,
                (hover || rating) >= star ? "text-amber-400 fill-current" : "text-zinc-200"
              )} 
            />
          </button>
        ))}
      </div>
    );
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [boardTasks, userTasks] = await Promise.all([
        getTasks(),
        getMyTasks(accountAddress)
      ]);
      setTasks(boardTasks);
      setMyTasks(userTasks);
    } catch (error) {
      console.error("Error fetching gigs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [accountAddress]);

  const handlePostGig = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostStatus("Initializing...");
    
    try {
      // Create Task in DB directly without upfront payment
      setPostStatus("Saving gig details...");
      await createGigTask({
        title: newTitle,
        description: newDesc,
        reward: parseFloat(newReward),
        deadline: newDeadline,
        creator_address: accountAddress,
        milestones: newMilestones.length > 0 ? newMilestones.map(m => ({ ...m, completed: false })) : undefined
      });

      setPostStatus("Gig posted successfully!");
      setTimeout(() => {
        setIsPosting(false);
        setPostStatus("");
        setNewTitle("");
        setNewDesc("");
        setNewReward("");
        setNewDeadline("");
        setNewMilestones([]);
        fetchData();
      }, 2000);
    } catch (error: any) {
      console.error("Post gig failed:", error);
      setPostStatus(`Error: ${error.message}`);
    }
  };

  const handleClaim = async (task: GigTask) => {
    setProcessingId(task.id);
    try {
      await claimTask(task, accountAddress);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleSubmitProof = async (taskId: string) => {
    if (!proofUrl) return;
    setProcessingId(taskId);
    try {
      await submitProof(taskId, accountAddress, proofUrl);
      setShowProofModal(null);
      setProofUrl("");
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprove = async (task: GigTask) => {
    setProcessingId(task.id);
    try {
      console.log(`Approving task and triggering escrow payment...`);
      await approveTask(task, accountAddress);
      console.log("Escrow contract executed, checking status...");
      await fetchData();
      console.log("Data refreshed.");
    } catch (error: any) {
      console.error("Approval/Payment failed:", error.message || error);
      alert(error.message || "An unexpected error occurred");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveMilestone = async (task: GigTask, index: number) => {
    setProcessingId(task.id);
    try {
      const milestone = task.milestones![index];
      const amountAlgo = Number(task.reward) * (milestone.percentage / 100);
      
      console.log(`Releasing ${milestone.percentage}% payout (${amountAlgo} ALGO) on-chain...`);
      const txId = await payoutMilestone(task, accountAddress, amountAlgo);
      
      const response = await fetch(`/api/tasks/${task.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          creator_address: accountAddress, 
          tx_id: txId, 
          milestone_index: index 
        }),
      });
      if (!response.ok) throw new Error("Failed to update milestone status in backend");
      
      alert(`Milestone "${milestone.title}" approved and paid on-chain!`);
      fetchData();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredTasks = tasks.filter(t => 
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'claimed': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'submitted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900">Campus Gigs</h2>
          <p className="text-zinc-500">Earn ALGO by helping fellow students</p>
        </div>
        <button
          onClick={() => setIsPosting(true)}
          className="flex items-center justify-center gap-2 bg-zinc-900 text-white px-4 py-2 rounded-xl hover:bg-zinc-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Post a Gig
        </button>
      </div>

      <div className="flex border-b border-zinc-200">
        <button
          onClick={() => setActiveTab('board')}
          className={`px-4 py-2 font-medium transition-colors relative ${
            activeTab === 'board' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          Gig Board
          {activeTab === 'board' && (
            <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('my-gigs')}
          className={`px-4 py-2 font-medium transition-colors relative ${
            activeTab === 'my-gigs' ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          My Gigs
          {activeTab === 'my-gigs' && (
            <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
          )}
        </button>
      </div>

      {activeTab === 'board' ? (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search for tasks (e.g., 'moving', 'essay')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
            />
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Loading available gigs...</p>
            </div>
          ) : filteredTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTasks.map((task) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-lg text-zinc-900 group-hover:text-zinc-700 transition-colors">
                      {task.title}
                    </h3>
                    <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-sm font-bold">
                      <DollarSign className="w-3.5 h-3.5" />
                      {task.reward} ALGO
                    </div>
                  </div>
                  <p className="text-zinc-600 text-sm mb-4 line-clamp-2">{task.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 mb-5">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Deadline: {new Date(task.deadline).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {task.creator_address.slice(0, 6)}...{task.creator_address.slice(-4)}
                    </div>
                  </div>

                  <button
                    onClick={() => handleClaim(task)}
                    disabled={processingId === task.id || task.creator_address === accountAddress}
                    className="w-full py-2.5 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {processingId === task.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Briefcase className="w-4 h-4" />
                    )}
                    {task.creator_address === accountAddress ? "Your Task" : "Claim Gig"}
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
              <Briefcase className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-zinc-900">No gigs found</h3>
              <p className="text-zinc-500">Be the first to post a task or try a different search!</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p>Loading your gigs...</p>
            </div>
          ) : myTasks.length > 0 ? (
            <div className="space-y-4">
              {myTasks.map((task) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="font-bold text-lg text-zinc-900">{task.title}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(task.status)}`}>
                          {task.status === 'completed' ? 'Paid' : task.status}
                        </span>
                      </div>
                      <p className="text-zinc-500 text-sm mb-2">
                        {task.creator_address === accountAddress ? "You created this gig" : "You claimed this gig"}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-zinc-400">
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> {task.reward} ALGO
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {new Date(task.deadline).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Milestones Display */}
                      {task.milestones && task.milestones.length > 0 && (
                        <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-zinc-400 uppercase font-black tracking-widest">Project Progress</p>
                            <p className="text-[10px] font-bold text-zinc-500">
                              {Math.round((task.milestones.filter(m => m.completed).reduce((acc, m) => acc + m.percentage, 0)))}% Complete
                            </p>
                          </div>
                          
                          {/* Progress Bar */}
                          <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${task.milestones.filter(m => m.completed).reduce((acc, m) => acc + m.percentage, 0)}%` }}
                              className="h-full bg-emerald-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                            {task.milestones.map((ms, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-zinc-50 px-3 py-2 rounded-xl border border-zinc-100">
                                <div className="flex items-center gap-2">
                                  {ms.completed ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Clock className="w-3.5 h-3.5 text-zinc-300" />}
                                  <span className={cn("text-xs font-medium", ms.completed ? "text-emerald-700 line-through" : "text-zinc-600")}>
                                    {ms.title} ({ms.percentage}%)
                                  </span>
                                </div>
                                {task.creator_address === accountAddress && task.status === 'submitted' && !ms.completed && (
                                   <button 
                                     onClick={() => handleApproveMilestone(task, idx)}
                                     disabled={processingId === task.id}
                                     className="text-[10px] font-black text-emerald-600 uppercase hover:underline disabled:opacity-50"
                                   >
                                     Release
                                   </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Actions based on role and status */}
                      {task.creator_address === accountAddress ? (
                        // Creator Actions
                        <>
                          {task.status === 'submitted' && (
                            <div className="flex items-center gap-2">
                              <a 
                                href={task.proof_url || "#"} 
                                target="_blank" 
                                rel="noreferrer"
                                className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                                title="View Proof"
                              >
                                <FileText className="w-5 h-5" />
                              </a>
                              {!task.milestones && (
                                <button
                                  onClick={() => handleApprove(task)}
                                  disabled={processingId === task.id}
                                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 text-sm font-medium"
                                >
                                  {processingId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                  Approve & Pay
                                </button>
                              )}
                            </div>
                          )}
                          {task.status === 'completed' && (
                            <div className="flex flex-col items-end gap-2">
                              <span className="text-emerald-600 flex items-center gap-1 text-sm font-medium">
                                <DollarSign className="w-4 h-4" /> Paid
                              </span>
                              {task.creator_address === accountAddress && !task.worker_rating && (
                                <div className="space-y-1 text-right">
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Rate Worker</p>
                                   <StarRating rating={0} onRate={(r) => handleRateWorker(task, r)} />
                                </div>
                              )}
                              {task.worker_rating && (
                                <div className="space-y-1 text-right">
                                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Your Rating</p>
                                  <StarRating rating={task.worker_rating} size={3.5} />
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        // Worker Actions
                        <>
                          {task.status === 'claimed' && (
                            <button
                              onClick={() => setShowProofModal(task.id)}
                              className="bg-zinc-900 text-white px-4 py-2 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                              <Send className="w-4 h-4" />
                              Submit Proof
                            </button>
                          )}
                          {task.status === 'submitted' && (
                            <span className="text-blue-600 flex items-center gap-1 text-sm font-medium">
                              <Clock className="w-4 h-4" /> Pending Approval
                            </span>
                          )}
                          {task.status === 'completed' && (
                            <span className="text-emerald-600 flex items-center gap-1 text-sm font-medium">
                              <DollarSign className="w-4 h-4" /> Paid
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-zinc-50 rounded-3xl border-2 border-dashed border-zinc-200">
              <Briefcase className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-zinc-900">No gigs yet</h3>
              <p className="text-zinc-500">Claim a gig from the board or post your own!</p>
            </div>
          )}
        </div>
      )}

      {/* Post Gig Modal */}
      <AnimatePresence>
        {isPosting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">Post a New Gig</h3>
                <button onClick={() => setIsPosting(false)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <form onSubmit={handlePostGig} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Gig Title</label>
                  <input
                    required
                    type="text"
                    placeholder="e.g., Help me move furniture"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Description</label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe the task in detail..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Reward (ALGO)</label>
                    <input
                      required
                      type="number"
                      step="0.1"
                      placeholder="5.0"
                      value={newReward}
                      onChange={(e) => setNewReward(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Deadline</label>
                    <input
                      required
                      type="date"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-700">Milestones (Optional)</label>
                    <button 
                      type="button" 
                      onClick={() => setNewMilestones([...newMilestones, { title: "", percentage: 0 }])}
                      className="text-xs font-bold text-zinc-900 flex items-center gap-1 hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Milestone
                    </button>
                  </div>
                  {newMilestones.map((ms, idx) => (
                    <div key={idx} className="flex gap-2 items-end bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">Title</label>
                        <input 
                          value={ms.title} 
                          onChange={(e) => {
                            const updated = [...newMilestones];
                            updated[idx].title = e.target.value;
                            setNewMilestones(updated);
                          }}
                          placeholder="e.g. First Draft" 
                          className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>
                      <div className="w-20">
                        <label className="text-[10px] uppercase font-bold text-zinc-400 mb-1 block">%</label>
                        <input 
                          type="number" 
                          value={ms.percentage} 
                          onChange={(e) => {
                            const updated = [...newMilestones];
                            updated[idx].percentage = parseInt(e.target.value);
                            setNewMilestones(updated);
                          }}
                          className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setNewMilestones(newMilestones.filter((_, i) => i !== idx))}
                        className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {newMilestones.length > 0 && (
                    <p className={cn("text-[10px] font-bold text-right", 
                      newMilestones.reduce((acc, m) => acc + m.percentage, 0) === 100 ? "text-emerald-500" : "text-red-500")}>
                      Total: {newMilestones.reduce((acc, m) => acc + m.percentage, 0)}% (must be 100%)
                    </p>
                  )}
                </div>

                {postStatus && (
                  <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${
                    postStatus.includes("Error") ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                  }`}>
                    {postStatus.includes("Initializing") || postStatus.includes("Broadcasting") ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : postStatus.includes("Error") ? (
                      <AlertCircle className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    {postStatus}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!!postStatus && !postStatus.includes("Error")}
                  className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-lg shadow-zinc-900/10"
                >
                  Post & Fund Escrow
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Proof Submission Modal */}
      <AnimatePresence>
        {showProofModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-zinc-900">Submit Proof</h3>
                <button onClick={() => setShowProofModal(null)} className="p-2 hover:bg-zinc-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-zinc-500" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Please provide a link to your proof (e.g., a photo on Google Drive, a link to the document, or a screenshot URL).
                </p>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Proof URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={proofUrl}
                    onChange={(e) => setProofUrl(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5"
                  />
                </div>

                <button
                  onClick={() => handleSubmitProof(showProofModal)}
                  disabled={!proofUrl || processingId === showProofModal}
                  className="w-full py-3 bg-zinc-900 text-white rounded-xl font-bold hover:bg-zinc-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {processingId === showProofModal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Submit to Creator
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
