import express from "express";
import { db } from "../db/database";

const router = express.Router();

router.get("/groups/:address", (req, res) => {
  try {
    const groups = db.prepare(`
      SELECT g.* FROM expense_groups g
      JOIN group_participants p ON g.id = p.group_id
      WHERE p.address = ?
      ORDER BY g.created_at DESC
    `).all(req.params.address);
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

router.post("/groups", (req, res) => {
  const { name, participants } = req.body;
  try {
    const result = db.transaction(() => {
      const g = db.prepare("INSERT INTO expense_groups (name) VALUES (?)").run(name);
      const groupId = g.lastInsertRowid;
      const ins = db.prepare("INSERT INTO group_participants (group_id, address) VALUES (?, ?)");
      participants.forEach((a: string) => ins.run(groupId, a));
      return { id: groupId, name, created_at: new Date().toISOString() };
    })();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to create group" });
  }
});

router.get("/groups/:id/details", (req, res) => {
  const { id } = req.params;
  try {
    const group = db.prepare("SELECT * FROM expense_groups WHERE id = ?").get(id);
    if (!group) return res.status(404).json({ error: "Not found" });
    const participants = db.prepare("SELECT address FROM group_participants WHERE group_id = ?").all(id);
    const expenses = db.prepare("SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC").all(id);
    const settlements = db.prepare("SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC").all(id);
    (expenses as any[]).forEach(e => {
       e.splits = db.prepare("SELECT address, share FROM expense_splits WHERE expense_id = ?").all(e.id);
    });
    res.json({ group, participants, expenses, settlements });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch details" });
  }
});

router.post("/expenses", (req, res) => {
  const { groupId, description, amount, payerAddress, splits } = req.body;
  try {
    db.transaction(() => {
      const res = db.prepare("INSERT INTO expenses (group_id, description, amount, payer_address) VALUES (?, ?, ?, ?)")
        .run(groupId, description, amount, payerAddress);
      const expenseId = res.lastInsertRowid;
      const ins = db.prepare("INSERT INTO expense_splits (expense_id, address, share) VALUES (?, ?, ?)");
      splits.forEach((s: any) => ins.run(expenseId, s.address, s.share));
    })();
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add expense" });
  }
});

router.post("/settlements", (req, res) => {
  const { groupId, fromAddress, toAddress, amount, txId } = req.body;
  try {
    db.prepare("INSERT INTO settlements (group_id, from_address, to_address, amount, tx_id) VALUES (?, ?, ?, ?, ?)")
      .run(groupId, fromAddress, toAddress, amount, txId);
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ error: "Failed to record settlement" });
  }
});

export default router;
