// Nama: Nasywa Destian Nabilah
// NIM: 24110400005

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const dotenv = require("dotenv");
dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const app = express();

app.use(express.json());

// =============================================
// SOAL 1 — WALLET ENDPOINTS
// =============================================

// 1a. GET /wallets — Ambil semua wallet, urutan createdAt desc
app.get("/wallets", async (req, res) => {
  try {
    const wallets = await prisma.wallet.findMany({
      orderBy: { createdAt: "desc" },
    });

    res.json(wallets);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message,
    });
  }
});

// 1b. POST /wallets — Buat wallet baru
app.post("/wallets", async (req, res) => {
  try {
    const { name, currency } = req.body;

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "name wajib diisi" });
    }

    const wallet = await prisma.wallet.create({
      data: {
        name: name.trim(),
        currency: currency || "IDR",
      },
    });

    res.status(201).json(wallet);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 1c. DELETE /wallets/:id — Hapus wallet beserta semua transaksinya
app.delete("/wallets/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet tidak ditemukan" });
    }

    // Hapus transaksi dulu baru wallet (foreign key constraint)
    await prisma.transaction.deleteMany({ where: { walletId: id } });
    await prisma.wallet.delete({ where: { id } });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================
// SOAL 2 — TRANSACTION ENDPOINTS
// =============================================

// 2a. GET /wallets/:id/transactions — Ambil semua transaksi wallet, urutan date desc
app.get("/wallets/:id/transactions", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet tidak ditemukan" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId: id },
      orderBy: { date: "desc" },
    });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2b. POST /wallets/:id/transactions — Tambah transaksi baru
app.post("/wallets/:id/transactions", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet tidak ditemukan" });
    }

    const { amount, type, category, date, note } = req.body;

    // Validasi field wajib
    if (!amount || !type || !category || !date) {
      return res
        .status(400)
        .json({ error: "amount, type, category, dan date wajib diisi" });
    }

    // Validasi type
    if (type !== "income" && type !== "expense") {
      return res
        .status(400)
        .json({ error: 'type harus "income" atau "expense"' });
    }

    // Validasi amount
    if (amount <= 0) {
      return res.status(400).json({ error: "amount harus lebih dari 0" });
    }

    const transaction = await prisma.transaction.create({
      data: {
        amount,
        type,
        category,
        date: new Date(date),
        note: note || null,
        walletId: id,
      },
    });

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2c. DELETE /transactions/:id — Hapus satu transaksi
// BONUS: response 200 dengan data transaksi yang dihapus + nama wallet
app.delete("/transactions/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { wallet: { select: { name: true } } },
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan" });
    }

    await prisma.transaction.delete({ where: { id } });

    // BONUS: kembalikan data transaksi yang dihapus beserta nama wallet
    res.status(200).json({ deleted: transaction });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================
// SOAL 3 — BALANCE & SUMMARY
// =============================================

// 3a. GET /wallets/:id/balance — Hitung saldo wallet
app.get("/wallets/:id/balance", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet tidak ditemukan" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId: id },
    });

    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      if (tx.type === "income") {
        totalIncome += tx.amount;
      } else if (tx.type === "expense") {
        totalExpense += tx.amount;
      }
    }

    const balance = totalIncome - totalExpense;

    res.json({
      walletId: id,
      walletName: wallet.name,
      totalIncome,
      totalExpense,
      balance,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// 3b. GET /wallets/:id/summary — Ringkasan per kategori
app.get("/wallets/:id/summary", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const wallet = await prisma.wallet.findUnique({ where: { id } });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet tidak ditemukan" });
    }

    const transactions = await prisma.transaction.findMany({
      where: { walletId: id },
    });

    // Kelompokkan transaksi berdasarkan category
    const grouped = {};

    for (const tx of transactions) {
      if (!grouped[tx.category]) {
        grouped[tx.category] = {
          category: tx.category,
          count: 0,
          totalAmount: 0,
          types: { income: 0, expense: 0 },
        };
      }

      grouped[tx.category].count += 1;
      grouped[tx.category].totalAmount += tx.amount;
      grouped[tx.category].types[tx.type] += 1;
    }

    // Konversi ke array dan hitung avgAmount
    const summary = Object.values(grouped).map((item) => ({
      ...item,
      avgAmount: parseFloat((item.totalAmount / item.count).toFixed(2)),
    }));

    res.json({
      walletId: id,
      walletName: wallet.name,
      summary,
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================
// START SERVER
// =============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});