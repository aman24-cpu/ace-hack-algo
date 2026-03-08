import express from "express";
import { randomUUID } from "crypto";
import { db } from "../db/database";
import { algodClient } from "../utils/algorand";

const router = express.Router();

router.get("/tasks", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE status = 'open' ORDER BY created_at DESC").all();
  res.json(tasks);
});

router.post("/tasks", async (req, res) => {
  const { title, description, reward, deadline, creator_address, app_id, tx_id, milestones } = req.body;
  const id = randomUUID();
  try {
    const milestonesStr = milestones ? JSON.stringify(milestones) : null;
    db.prepare("INSERT INTO tasks (id, title, description, reward, deadline, creator_address, app_id, tx_id, milestones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, title, description, reward, deadline, creator_address, app_id, tx_id, milestonesStr);
    res.json({ id, status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to post gig" });
  }
});

router.post("/tasks/:id/claim", (req, res) => {
  const { id } = req.params;
  const { worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task || task.status !== 'open') return res.status(400).json({ error: "Task not available" });
    db.prepare("UPDATE tasks SET worker_address = ?, status = 'claimed' WHERE id = ?").run(worker_address, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to claim" });
  }
});

router.post("/tasks/:id/submit", (req, res) => {
  const { id } = req.params;
  const { proof_url, worker_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task || task.worker_address !== worker_address) return res.status(403).json({ error: "Unauthorized" });
    db.prepare("UPDATE tasks SET proof_url = ?, status = 'submitted' WHERE id = ?").run(proof_url, id);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit" });
  }
});

router.post("/tasks/:id/rate", (req, res) => {
  const { id } = req.params;
  const { rating, creator_address } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    console.log(`Rating request: task_id=${id}, rating=${rating}, creator_addr=${creator_address}`);
    if (task) {
      console.log(`Task found: task_id=${task.id}, task_creator=${task.creator_address}`);
    } else {
      console.warn(`Task NOT found for id: ${id}`);
    }
    
    if (!task || task.creator_address.toLowerCase() !== creator_address.toLowerCase()) {
      console.warn("Rating unauthorized: Creator mismatch");
      return res.status(403).json({ error: "Unauthorized" });
    }
    const result = db.prepare("UPDATE tasks SET worker_rating = ? WHERE id = ?").run(rating, id);
    console.log("Update Result:", result);
    res.json({ status: "success" });
  } catch (error: any) {
    console.error("Error rating worker:", error.message);
    res.status(500).json({ error: error.message || "Failed to rate worker" });
  }
});

router.post("/tasks/:id/approve", async (req, res) => {
  const { id } = req.params;
  const { creator_address, tx_id, milestone_index } = req.body;
  try {
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    if (!task || task.creator_address !== creator_address) return res.status(403).json({ error: "Unauthorized" });
    
    if (milestone_index !== undefined && task.milestones) {
      const milestones = JSON.parse(task.milestones);
      if (milestones[milestone_index]) {
        milestones[milestone_index].completed = true;
        milestones[milestone_index].tx_id = tx_id;
        
        const allDone = milestones.every((m: any) => m.completed);
        const nextStatus = allDone ? 'completed' : 'claimed';
        
        db.prepare("UPDATE tasks SET milestones = ?, status = ? WHERE id = ?")
          .run(JSON.stringify(milestones), nextStatus, id);
      }
    } else {
      db.prepare("UPDATE tasks SET status = 'completed', tx_id = ? WHERE id = ?").run(tx_id, id);
    }
    
    res.json({ status: "success" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to approve" });
  }
});

router.get("/my-tasks/:address", (req, res) => {
  const tasks = db.prepare("SELECT * FROM tasks WHERE creator_address = ? OR worker_address = ? ORDER BY created_at DESC").all(req.params.address, req.params.address);
  res.json(tasks);
});

export default router;
