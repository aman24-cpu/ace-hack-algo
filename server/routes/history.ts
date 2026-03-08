import express from "express";

const router = express.Router();

router.get("/history/:address", async (req, res) => {
  const { address } = req.params;
  const INDEXER_SERVER = "https://testnet-idx.algonode.cloud";
  try {
    const response = await fetch(`${INDEXER_SERVER}/v2/accounts/${address}/transactions?limit=10`);
    if (!response.ok) return res.json({ transactions: [] });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

export default router;
