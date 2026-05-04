require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || `http://localhost:${PORT}`;
const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org";
const SALE_RECEIVER_ADDRESS = String(process.env.SALE_RECEIVER_ADDRESS || "").toLowerCase();
const REFERRAL_PERCENT = Number(process.env.REFERRAL_PERCENT || 5);
const SNC_PER_BNB = Number(process.env.SNC_PER_BNB || 12500);
const PRESALE_TOKENS_FOR_SALE = Number(process.env.PRESALE_TOKENS_FOR_SALE || 65000000);
const MIN_CONFIRMATIONS = Number(process.env.MIN_CONFIRMATIONS || 1);
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const DATABASE_URL = process.env.DATABASE_URL || "";
const DATABASE_SSL =
  String(process.env.DATABASE_SSL || "").toLowerCase() === "true" ||
  /sslmode=require/i.test(DATABASE_URL);
const SNC_TOKEN_ADDRESS = String(process.env.SNC_TOKEN_ADDRESS || "").toLowerCase();
const SNC_TOKEN_DECIMALS = Number(process.env.SNC_TOKEN_DECIMALS || 18);

const REFERRAL_BPS = Math.round(REFERRAL_PERCENT * 100);

if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL en el archivo .env.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined
});

app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? "*" : CORS_ORIGIN
  })
);
app.use(express.json({ limit: "100kb" }));

const nowIso = () => new Date().toISOString();

const isValidAddress = (address) => /^0x[a-fA-F0-9]{40}$/.test(String(address || ""));
const isValidTxHash = (hash) => /^0x[a-fA-F0-9]{64}$/.test(String(hash || ""));
const normalizeAddress = (address) => String(address || "").toLowerCase();

const createReferralCode = (wallet) => {
  return `snc_${crypto
    .createHash("sha256")
    .update(normalizeAddress(wallet))
    .digest("hex")
    .slice(0, 12)}`;
};

const requireAdmin = (req, res, next) => {
  const key = req.body?.adminKey || req.query?.adminKey || req.headers["x-admin-key"];

  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    return res.status(401).json({
      ok: false,
      error: "No autorizado. Ingresa un ADMIN_KEY válido."
    });
  }

  return next();
};

const hexToBigInt = (hex) => BigInt(hex || "0x0");

const formatWeiToBnb = (wei) => {
  const value = BigInt(String(wei || "0").split(".")[0]);
  const base = 10n ** 18n;
  const whole = value / base;
  const fraction = (value % base).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
};

const bnbToNumber = (bnbString) => {
  const parsed = Number(bnbString);
  return Number.isFinite(parsed) ? parsed : 0;
};

const bnbToSncString = (bnbString) => {
  const value = bnbToNumber(bnbString);
  const snc = value * SNC_PER_BNB;
  return Number.isFinite(snc) ? String(snc) : "0";
};

const numericToBigInt = (value) => BigInt(String(value || "0").split(".")[0]);

const toPurchaseDto = (row) => ({
  id: row.id,
  txHash: row.tx_hash,
  buyerWallet: row.buyer_wallet,
  receiverWallet: row.receiver_wallet,
  ref: row.ref || "",
  referralCode: row.referral_code || "",
  referrerWallet: row.referrer_wallet || "",
  amountWei: String(row.amount_wei || "0"),
  amountBnb: row.amount_bnb || "0",
  tokensSncEstimated: row.tokens_snc_estimated || "0",
  commissionPercent: Number(row.commission_percent || 0),
  commissionWei: String(row.commission_wei || "0"),
  commissionBnb: row.commission_bnb || "0",
  commissionSncEstimated: bnbToSncString(row.commission_bnb || "0"),
  payoutStatus: row.payout_status,
  tokenDeliveryStatus: row.token_delivery_status || "pending",
  tokenDeliveryTxHash: row.token_delivery_tx_hash || "",
  tokenDeliveredAt: row.token_delivered_at ? new Date(row.token_delivered_at).toISOString() : "",
  blockNumber: Number(row.block_number || 0),
  confirmations: Number(row.confirmations || 0),
  payoutTxHash: row.payout_tx_hash || "",
  paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : "",
  createdAt: row.created_at ? new Date(row.created_at).toISOString() : ""
});

const getPresaleStats = async (db = pool) => {
  const result = await db.query(`
    SELECT
      COALESCE(SUM(amount_wei), 0)::TEXT AS raised_wei,
      COUNT(*)::INT AS total_purchases
    FROM purchases
  `);

  const row = result.rows[0] || {};
  const raisedWei = numericToBigInt(row.raised_wei || "0");
  const raisedBnb = formatWeiToBnb(raisedWei);
  const goalBnb = SNC_PER_BNB > 0 ? PRESALE_TOKENS_FOR_SALE / SNC_PER_BNB : 0;
  const progressPercent = goalBnb > 0 ? Math.min((bnbToNumber(raisedBnb) / goalBnb) * 100, 100) : 0;

  return {
    raisedWei: raisedWei.toString(),
    raisedBnb,
    goalBnb: String(goalBnb),
    totalPurchases: Number(row.total_purchases || 0),
    presaleTokensForSale: PRESALE_TOKENS_FOR_SALE,
    sncPerBnb: SNC_PER_BNB,
    progressPercent
  };
};

const rpc = async (method, params = []) => {
  const response = await fetch(BSC_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });

  if (!response.ok) {
    throw new Error(`RPC BSC no respondió correctamente: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || "Error RPC en BNB Smart Chain.");
  }

  return data.result;
};

const verifyBscPurchase = async ({ txHash, buyerWallet }) => {
  if (!isValidTxHash(txHash)) {
    throw new Error("txHash inválido.");
  }

  if (!isValidAddress(SALE_RECEIVER_ADDRESS)) {
    throw new Error("Configura SALE_RECEIVER_ADDRESS en el backend antes de registrar compras.");
  }

  const [tx, receipt, latestBlockHex] = await Promise.all([
    rpc("eth_getTransactionByHash", [txHash]),
    rpc("eth_getTransactionReceipt", [txHash]),
    rpc("eth_blockNumber", [])
  ]);

  if (!tx) {
    throw new Error("La transacción todavía no existe en BNB Smart Chain.");
  }

  if (!receipt) {
    throw new Error("La transacción aún está pendiente de confirmación.");
  }

  if (String(receipt.status).toLowerCase() !== "0x1") {
    throw new Error("La transacción falló en la red.");
  }

  const txTo = normalizeAddress(tx.to);
  const txFrom = normalizeAddress(tx.from);
  const expectedReceiver = normalizeAddress(SALE_RECEIVER_ADDRESS);

  if (txTo !== expectedReceiver) {
    throw new Error("La transacción no fue enviada a la wallet de recaudo configurada.");
  }

  if (buyerWallet && isValidAddress(buyerWallet) && txFrom !== normalizeAddress(buyerWallet)) {
    throw new Error("La wallet compradora no coincide con el remitente de la transacción.");
  }

  const latestBlock = Number(hexToBigInt(latestBlockHex));
  const txBlock = Number(hexToBigInt(receipt.blockNumber));
  const confirmations = Math.max(latestBlock - txBlock + 1, 0);

  if (confirmations < MIN_CONFIRMATIONS) {
    throw new Error(`Faltan confirmaciones. Actual: ${confirmations}, requeridas: ${MIN_CONFIRMATIONS}.`);
  }

  const valueWei = hexToBigInt(tx.value || "0x0");

  if (valueWei <= 0n) {
    throw new Error("La transacción no envió BNB.");
  }

  return {
    txHash: txHash.toLowerCase(),
    from: txFrom,
    to: txTo,
    valueWei: valueWei.toString(),
    amountBnb: formatWeiToBnb(valueWei),
    blockNumber: txBlock,
    confirmations
  };
};

const tokenAmountToUnits = (amount, decimals = 18) => {
  const clean = String(amount || "0").replace(/,/g, "").trim();

  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new Error("Monto SNC inválido.");
  }

  const [whole, fraction = ""] = clean.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);

  return BigInt(whole || "0") * (10n ** BigInt(decimals)) + BigInt(paddedFraction || "0");
};

const verifySncTransfer = async ({ txHash, payerWallet, receiverWallet, expectedSnc }) => {
  if (!isValidTxHash(txHash)) {
    throw new Error("Hash de envío inválido.");
  }

  if (!isValidAddress(SNC_TOKEN_ADDRESS)) {
    throw new Error("Configura SNC_TOKEN_ADDRESS en Render antes de marcar pagos.");
  }

  if (!isValidAddress(receiverWallet)) {
    throw new Error("Wallet destino inválida.");
  }

  const [tx, receipt, latestBlockHex] = await Promise.all([
    rpc("eth_getTransactionByHash", [txHash]),
    rpc("eth_getTransactionReceipt", [txHash]),
    rpc("eth_blockNumber", [])
  ]);

  if (!tx) {
    throw new Error("La transacción de SNC todavía no existe en BNB Smart Chain.");
  }

  if (!receipt) {
    throw new Error("La transacción de SNC aún está pendiente.");
  }

  if (String(receipt.status).toLowerCase() !== "0x1") {
    throw new Error("La transacción de SNC falló en la red.");
  }

  const txTo = normalizeAddress(tx.to);
  const txFrom = normalizeAddress(tx.from);
  const tokenAddress = normalizeAddress(SNC_TOKEN_ADDRESS);

  if (txTo !== tokenAddress) {
    throw new Error("La transacción no fue enviada al contrato SNC configurado.");
  }

  if (payerWallet && isValidAddress(payerWallet) && txFrom !== normalizeAddress(payerWallet)) {
    throw new Error("La wallet pagadora no coincide con el remitente de la transacción.");
  }

  const input = String(tx.input || "").toLowerCase();
  if (!input.startsWith("0xa9059cbb") || input.length < 138) {
    throw new Error("La transacción no parece ser un transfer ERC20/BEP20.");
  }

  const encodedReceiver = `0x${input.slice(34, 74)}`;
  const encodedAmount = BigInt(`0x${input.slice(74, 138)}`);
  const expectedUnits = tokenAmountToUnits(expectedSnc, SNC_TOKEN_DECIMALS);

  if (normalizeAddress(encodedReceiver) !== normalizeAddress(receiverWallet)) {
    throw new Error("La wallet destino no coincide con la transacción de SNC.");
  }

  if (encodedAmount < expectedUnits) {
    throw new Error("El monto enviado es menor al monto pendiente esperado.");
  }

  const latestBlock = Number(hexToBigInt(latestBlockHex));
  const txBlock = Number(hexToBigInt(receipt.blockNumber));
  const confirmations = Math.max(latestBlock - txBlock + 1, 0);

  if (confirmations < MIN_CONFIRMATIONS) {
    throw new Error(`Faltan confirmaciones del envío SNC. Actual: ${confirmations}, requeridas: ${MIN_CONFIRMATIONS}.`);
  }

  return {
    txHash: txHash.toLowerCase(),
    from: txFrom,
    to: encodedReceiver,
    amountUnits: encodedAmount.toString(),
    blockNumber: txBlock,
    confirmations
  };
};

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrers (
      wallet TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY,
      tx_hash TEXT UNIQUE NOT NULL,
      buyer_wallet TEXT NOT NULL,
      receiver_wallet TEXT NOT NULL,
      ref TEXT,
      referral_code TEXT,
      referrer_wallet TEXT REFERENCES referrers(wallet),
      amount_wei NUMERIC(78,0) NOT NULL,
      amount_bnb TEXT NOT NULL,
      tokens_snc_estimated TEXT NOT NULL,
      commission_percent NUMERIC(10,4) NOT NULL DEFAULT 0,
      commission_wei NUMERIC(78,0) NOT NULL DEFAULT 0,
      commission_bnb TEXT NOT NULL DEFAULT '0',
      payout_status TEXT NOT NULL DEFAULT 'none',
      block_number BIGINT NOT NULL,
      confirmations INTEGER NOT NULL,
      payout_tx_hash TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_purchases_referrer_wallet ON purchases(referrer_wallet);
    CREATE INDEX IF NOT EXISTS idx_purchases_buyer_wallet ON purchases(buyer_wallet);
    CREATE INDEX IF NOT EXISTS idx_purchases_payout_status ON purchases(payout_status);

    CREATE TABLE IF NOT EXISTS payouts (
      id UUID PRIMARY KEY,
      referrer_wallet TEXT NOT NULL REFERENCES referrers(wallet),
      amount_wei NUMERIC(78,0) NOT NULL,
      amount_bnb TEXT NOT NULL,
      payout_tx_hash TEXT,
      purchase_tx_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS buyer_deliveries (
      id UUID PRIMARY KEY,
      buyer_wallet TEXT NOT NULL,
      amount_snc TEXT NOT NULL,
      delivery_tx_hash TEXT,
      purchase_tx_hashes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE purchases
      ADD COLUMN IF NOT EXISTS token_delivery_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS token_delivery_tx_hash TEXT,
      ADD COLUMN IF NOT EXISTS token_delivered_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_purchases_token_delivery_status ON purchases(token_delivery_status);
    CREATE INDEX IF NOT EXISTS idx_buyer_deliveries_wallet ON buyer_deliveries(buyer_wallet);
  `);
};

const getReferrerByRef = async (client, ref) => {
  const cleanRef = String(ref || "").trim();

  if (!cleanRef) return null;

  if (isValidAddress(cleanRef)) {
    const wallet = normalizeAddress(cleanRef);
    const code = createReferralCode(wallet);

    const result = await client.query(
      `
        INSERT INTO referrers (wallet, code, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (wallet)
        DO UPDATE SET updated_at = NOW()
        RETURNING wallet, code, created_at, updated_at
      `,
      [wallet, code]
    );

    return result.rows[0] || null;
  }

  const result = await client.query(
    "SELECT wallet, code, created_at, updated_at FROM referrers WHERE code = $1 LIMIT 1",
    [cleanRef]
  );

  return result.rows[0] || null;
};

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "SNC Referral Backend PostgreSQL",
      database: "connected",
      bscRpcConfigured: Boolean(BSC_RPC_URL),
      receiverConfigured: isValidAddress(SALE_RECEIVER_ADDRESS),
      referralPercent: REFERRAL_PERCENT
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      database: "error",
      error: error.message || "No se pudo conectar con PostgreSQL."
    });
  }
});

app.get("/api/public-config", (req, res) => {
  res.json({
    ok: true,
    saleReceiverAddress: isValidAddress(SALE_RECEIVER_ADDRESS) ? SALE_RECEIVER_ADDRESS : "",
    sncTokenAddress: isValidAddress(SNC_TOKEN_ADDRESS) ? SNC_TOKEN_ADDRESS : "",
    sncTokenDecimals: SNC_TOKEN_DECIMALS,
    sncPerBnb: SNC_PER_BNB,
    presaleTokensForSale: PRESALE_TOKENS_FOR_SALE,
    referralPercent: REFERRAL_PERCENT
  });
});

app.get("/api/presale/stats", async (req, res) => {
  try {
    const stats = await getPresaleStats();
    res.json({
      ok: true,
      ...stats
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo cargar el total recaudado."
    });
  }
});

app.post("/api/referrals/create", async (req, res) => {
  try {
    const wallet = normalizeAddress(req.body?.wallet);
    const pageUrl = String(req.body?.pageUrl || PUBLIC_SITE_URL).replace(/[?#].*$/, "");

    if (!isValidAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Wallet de referidor inválida." });
    }

    const code = createReferralCode(wallet);

    const result = await pool.query(
      `
        INSERT INTO referrers (wallet, code, created_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (wallet)
        DO UPDATE SET updated_at = NOW()
        RETURNING wallet, code
      `,
      [wallet, code]
    );

    const referrer = result.rows[0];

    const url = new URL(pageUrl || PUBLIC_SITE_URL);
    url.searchParams.set("ref", referrer.code);

    res.json({
      ok: true,
      wallet: referrer.wallet,
      code: referrer.code,
      referralUrl: url.toString(),
      commissionPercent: REFERRAL_PERCENT
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo generar el referido."
    });
  }
});

app.post("/api/referrals/track-click", (req, res) => {
  // No guardamos clicks como comisión.
  // La comisión se crea únicamente cuando /api/purchases/register verifica un txHash real.
  res.json({ ok: true, tracked: false });
});

app.post("/api/purchases/register", async (req, res) => {
  const client = await pool.connect();

  try {
    const txHash = String(req.body?.txHash || "").toLowerCase();
    const buyerWallet = normalizeAddress(req.body?.buyerWallet);
    const ref = String(req.body?.ref || "").trim();

    if (!isValidTxHash(txHash)) {
      return res.status(400).json({ ok: false, error: "txHash inválido." });
    }

    const existingResult = await client.query("SELECT * FROM purchases WHERE tx_hash = $1 LIMIT 1", [txHash]);

    if (existingResult.rows.length) {
      const presaleStats = await getPresaleStats(client);

      return res.json({
        ok: true,
        duplicate: true,
        purchase: toPurchaseDto(existingResult.rows[0]),
        presaleStats
      });
    }

    const verified = await verifyBscPurchase({ txHash, buyerWallet });

    await client.query("BEGIN");

    const referrer = await getReferrerByRef(client, ref);

    let commissionWei = "0";
    let commissionBnb = "0";
    let referrerWallet = null;
    let referralCode = "";

    if (referrer && normalizeAddress(referrer.wallet) !== normalizeAddress(verified.from)) {
      const valueWei = BigInt(verified.valueWei);
      const calculatedCommissionWei = (valueWei * BigInt(REFERRAL_BPS)) / 10000n;
      commissionWei = calculatedCommissionWei.toString();
      commissionBnb = formatWeiToBnb(calculatedCommissionWei);
      referrerWallet = referrer.wallet;
      referralCode = referrer.code || createReferralCode(referrer.wallet);
    }

    const amountNumber = bnbToNumber(verified.amountBnb);
    const id = crypto.randomUUID();

    const insertResult = await client.query(
      `
        INSERT INTO purchases (
          id,
          tx_hash,
          buyer_wallet,
          receiver_wallet,
          ref,
          referral_code,
          referrer_wallet,
          amount_wei,
          amount_bnb,
          tokens_snc_estimated,
          commission_percent,
          commission_wei,
          commission_bnb,
          payout_status,
          block_number,
          confirmations,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, NOW()
        )
        RETURNING *
      `,
      [
        id,
        txHash,
        verified.from,
        verified.to,
        ref,
        referralCode,
        referrerWallet,
        verified.valueWei,
        verified.amountBnb,
        String(amountNumber * SNC_PER_BNB),
        referrerWallet ? REFERRAL_PERCENT : 0,
        commissionWei,
        commissionBnb,
        referrerWallet ? "pending" : "none",
        verified.blockNumber,
        verified.confirmations
      ]
    );

    await client.query("COMMIT");

    const purchase = toPurchaseDto(insertResult.rows[0]);
    const presaleStats = await getPresaleStats(pool);

    res.json({
      ok: true,
      purchase,
      referralApplied: Boolean(referrerWallet),
      presaleStats
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(400).json({
      ok: false,
      error: error.message || "No se pudo registrar la compra."
    });
  } finally {
    client.release();
  }
});

app.get("/api/wallet-summary/:wallet", async (req, res) => {
  try {
    const wallet = normalizeAddress(req.params.wallet);

    if (!isValidAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Wallet inválida." });
    }

    const result = await pool.query(
      `
        SELECT
          COUNT(*)::INT AS purchase_count,
          COALESCE(SUM(amount_bnb::numeric), 0) AS total_spent_bnb,
          COALESCE(SUM(tokens_snc_estimated::numeric), 0) AS total_purchased_snc
        FROM purchases
        WHERE buyer_wallet = $1
      `,
      [wallet]
    );

    const row = result.rows[0] || {};

    res.json({
      ok: true,
      wallet,
      purchaseCount: Number(row.purchase_count || 0),
      totalSpentBnb: String(row.total_spent_bnb || "0"),
      totalPurchasedSnc: String(row.total_purchased_snc || "0")
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo cargar el resumen de la wallet."
    });
  }
});

app.get("/api/referrals/summary/:wallet", async (req, res) => {
  try {
    const wallet = normalizeAddress(req.params.wallet);

    if (!isValidAddress(wallet)) {
      return res.status(400).json({ ok: false, error: "Wallet inválida." });
    }

    const referrerResult = await pool.query("SELECT wallet, code FROM referrers WHERE wallet = $1 LIMIT 1", [wallet]);
    const purchasesResult = await pool.query(
      "SELECT * FROM purchases WHERE referrer_wallet = $1 ORDER BY created_at DESC",
      [wallet]
    );

    const purchases = purchasesResult.rows.map(toPurchaseDto);
    const pendingWei = purchases
      .filter((item) => item.payoutStatus === "pending")
      .reduce((sum, item) => sum + BigInt(item.commissionWei || "0"), 0n);

    const paidWei = purchases
      .filter((item) => item.payoutStatus === "paid")
      .reduce((sum, item) => sum + BigInt(item.commissionWei || "0"), 0n);

    res.json({
      ok: true,
      wallet,
      code: referrerResult.rows[0]?.code || createReferralCode(wallet),
      totalClicks: 0,
      totalPurchases: purchases.length,
      pendingRewardsBnb: formatWeiToBnb(pendingWei),
      paidRewardsBnb: formatWeiToBnb(paidWei),
      purchases
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo cargar el resumen."
    });
  }
});

app.get("/api/admin/referrals", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        referrer_wallet,
        COALESCE(MAX(referral_code), '') AS code,
        COUNT(*)::INT AS total_purchases,
        COALESCE(SUM(amount_wei), 0)::TEXT AS total_volume_wei,
        COALESCE(SUM(CASE WHEN payout_status = 'pending' THEN commission_wei ELSE 0 END), 0)::TEXT AS pending_rewards_wei,
        COALESCE(SUM(CASE WHEN payout_status = 'paid' THEN commission_wei ELSE 0 END), 0)::TEXT AS paid_rewards_wei
      FROM purchases
      WHERE referrer_wallet IS NOT NULL
      GROUP BY referrer_wallet
      ORDER BY MAX(created_at) DESC
    `);

    const referrers = result.rows.map((row) => {
      const totalVolumeBnb = formatWeiToBnb(numericToBigInt(row.total_volume_wei));
      const pendingRewardsBnb = formatWeiToBnb(numericToBigInt(row.pending_rewards_wei));
      const paidRewardsBnb = formatWeiToBnb(numericToBigInt(row.paid_rewards_wei));

      return {
        referrerWallet: row.referrer_wallet,
        code: row.code || "",
        totalPurchases: Number(row.total_purchases || 0),
        totalVolumeBnb,
        totalVolumeSnc: bnbToSncString(totalVolumeBnb),
        pendingRewardsBnb,
        pendingRewardsSnc: bnbToSncString(pendingRewardsBnb),
        paidRewardsBnb,
        paidRewardsSnc: bnbToSncString(paidRewardsBnb)
      };
    });

    const totalPendingWei = result.rows.reduce(
      (sum, row) => sum + numericToBigInt(row.pending_rewards_wei),
      0n
    );

    const totalPurchases = result.rows.reduce(
      (sum, row) => sum + Number(row.total_purchases || 0),
      0
    );

    res.json({
      ok: true,
      totalReferrers: referrers.length,
      totalPurchases,
      totalPendingRewardsBnb: formatWeiToBnb(totalPendingWei),
      totalPendingRewardsSnc: bnbToSncString(formatWeiToBnb(totalPendingWei)),
      referrers
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo cargar el panel admin."
    });
  }
});

app.get("/api/admin/purchases", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM purchases ORDER BY created_at DESC");
    res.json({
      ok: true,
      purchases: result.rows.map(toPurchaseDto)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudieron cargar las compras."
    });
  }
});

app.get("/api/admin/buyers", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        buyer_wallet,
        COUNT(*)::INT AS total_purchases,
        COALESCE(SUM(tokens_snc_estimated::numeric), 0)::TEXT AS total_purchased_snc,
        COALESCE(SUM(CASE WHEN token_delivery_status = 'paid' THEN tokens_snc_estimated::numeric ELSE 0 END), 0)::TEXT AS delivered_snc,
        COALESCE(SUM(CASE WHEN token_delivery_status <> 'paid' THEN tokens_snc_estimated::numeric ELSE 0 END), 0)::TEXT AS pending_delivery_snc,
        MAX(created_at) AS last_purchase_at
      FROM purchases
      GROUP BY buyer_wallet
      ORDER BY MAX(created_at) DESC
    `);

    const buyers = result.rows.map((row) => ({
      buyerWallet: row.buyer_wallet,
      totalPurchases: Number(row.total_purchases || 0),
      totalPurchasedSnc: row.total_purchased_snc || "0",
      deliveredSnc: row.delivered_snc || "0",
      pendingDeliverySnc: row.pending_delivery_snc || "0",
      lastPurchaseAt: row.last_purchase_at ? new Date(row.last_purchase_at).toISOString() : ""
    }));

    const totalPending = buyers.reduce((sum, buyer) => sum + Number(buyer.pendingDeliverySnc || 0), 0);
    const totalDelivered = buyers.reduce((sum, buyer) => sum + Number(buyer.deliveredSnc || 0), 0);

    res.json({
      ok: true,
      totalBuyers: buyers.length,
      totalPendingDeliverySnc: String(totalPending),
      totalDeliveredSnc: String(totalDelivered),
      buyers
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudieron cargar los compradores."
    });
  }
});

app.post("/api/admin/buyer-deliveries/mark-paid", requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const buyerWallet = normalizeAddress(req.body?.buyerWallet);
    const deliveryTxHash = String(req.body?.deliveryTxHash || "").toLowerCase();
    const payerWallet = normalizeAddress(req.body?.payerWallet);
    const expectedSnc = String(req.body?.expectedSnc || "0");

    if (!isValidAddress(buyerWallet)) {
      return res.status(400).json({ ok: false, error: "Wallet de comprador inválida." });
    }

    if (!isValidTxHash(deliveryTxHash)) {
      return res.status(400).json({ ok: false, error: "Hash de envío inválido." });
    }

    await verifySncTransfer({
      txHash: deliveryTxHash,
      payerWallet,
      receiverWallet: buyerWallet,
      expectedSnc
    });

    await client.query("BEGIN");

    const pendingResult = await client.query(
      `
        SELECT *
        FROM purchases
        WHERE buyer_wallet = $1 AND token_delivery_status <> 'paid'
        FOR UPDATE
      `,
      [buyerWallet]
    );

    const pendingPurchases = pendingResult.rows;

    if (!pendingPurchases.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "No hay SNC pendientes por enviar a este comprador." });
    }

    const totalSnc = pendingPurchases.reduce(
      (sum, item) => sum + Number(item.tokens_snc_estimated || 0),
      0
    );

    await client.query(
      `
        UPDATE purchases
        SET token_delivery_status = 'paid',
            token_delivered_at = NOW(),
            token_delivery_tx_hash = $2
        WHERE buyer_wallet = $1 AND token_delivery_status <> 'paid'
      `,
      [buyerWallet, deliveryTxHash]
    );

    const deliveryId = crypto.randomUUID();
    const purchaseTxHashes = pendingPurchases.map((item) => item.tx_hash);

    const deliveryResult = await client.query(
      `
        INSERT INTO buyer_deliveries (
          id,
          buyer_wallet,
          amount_snc,
          delivery_tx_hash,
          purchase_tx_hashes,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
        RETURNING *
      `,
      [
        deliveryId,
        buyerWallet,
        String(totalSnc),
        deliveryTxHash,
        JSON.stringify(purchaseTxHashes)
      ]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      delivery: {
        id: deliveryResult.rows[0].id,
        buyerWallet: deliveryResult.rows[0].buyer_wallet,
        amountSnc: deliveryResult.rows[0].amount_snc,
        deliveryTxHash: deliveryResult.rows[0].delivery_tx_hash || "",
        purchaseTxHashes,
        createdAt: deliveryResult.rows[0].created_at
          ? new Date(deliveryResult.rows[0].created_at).toISOString()
          : nowIso()
      }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo marcar la entrega como pagada."
    });
  } finally {
    client.release();
  }
});

app.post("/api/admin/payouts/mark-paid", requireAdmin, async (req, res) => {
  const client = await pool.connect();

  try {
    const referrerWallet = normalizeAddress(req.body?.referrerWallet);
    const payoutTxHash = String(req.body?.payoutTxHash || "").toLowerCase();
    const payerWallet = normalizeAddress(req.body?.payerWallet);
    const expectedSnc = String(req.body?.expectedSnc || "0");

    if (!isValidAddress(referrerWallet)) {
      return res.status(400).json({ ok: false, error: "Wallet de referidor inválida." });
    }

    if (!isValidTxHash(payoutTxHash)) {
      return res.status(400).json({ ok: false, error: "Hash de pago inválido." });
    }

    await verifySncTransfer({
      txHash: payoutTxHash,
      payerWallet,
      receiverWallet: referrerWallet,
      expectedSnc
    });

    await client.query("BEGIN");

    const pendingResult = await client.query(
      `
        SELECT *
        FROM purchases
        WHERE referrer_wallet = $1 AND payout_status = 'pending'
        FOR UPDATE
      `,
      [referrerWallet]
    );

    const pendingPurchases = pendingResult.rows;

    if (!pendingPurchases.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ ok: false, error: "No hay comisiones pendientes para esta wallet." });
    }

    const totalWei = pendingPurchases.reduce(
      (sum, item) => sum + numericToBigInt(item.commission_wei),
      0n
    );

    await client.query(
      `
        UPDATE purchases
        SET payout_status = 'paid',
            paid_at = NOW(),
            payout_tx_hash = $2
        WHERE referrer_wallet = $1 AND payout_status = 'pending'
      `,
      [referrerWallet, payoutTxHash || ""]
    );

    const payoutId = crypto.randomUUID();
    const purchaseTxHashes = pendingPurchases.map((item) => item.tx_hash);

    const payoutResult = await client.query(
      `
        INSERT INTO payouts (
          id,
          referrer_wallet,
          amount_wei,
          amount_bnb,
          payout_tx_hash,
          purchase_tx_hashes,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
        RETURNING *
      `,
      [
        payoutId,
        referrerWallet,
        totalWei.toString(),
        formatWeiToBnb(totalWei),
        payoutTxHash || "",
        JSON.stringify(purchaseTxHashes)
      ]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      payout: {
        id: payoutResult.rows[0].id,
        referrerWallet: payoutResult.rows[0].referrer_wallet,
        amountWei: String(payoutResult.rows[0].amount_wei),
        amountBnb: payoutResult.rows[0].amount_bnb,
        payoutTxHash: payoutResult.rows[0].payout_tx_hash || "",
        purchaseTxHashes,
        createdAt: payoutResult.rows[0].created_at
          ? new Date(payoutResult.rows[0].created_at).toISOString()
          : nowIso()
      }
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({
      ok: false,
      error: error.message || "No se pudo marcar como pagado."
    });
  } finally {
    client.release();
  }
});

// Servir también la web desde el mismo backend.
// Así puedes abrir http://localhost:3001 y evitar problemas de Live Server/CORS.
app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
});

const start = async () => {
  try {
    await initDb();

    app.listen(PORT, () => {
      console.log(`SNC Referral Backend PostgreSQL corriendo en http://localhost:${PORT}`);
      console.log(`Comisión de referidos: ${REFERRAL_PERCENT}%`);
      console.log(`Receiver configurado: ${isValidAddress(SALE_RECEIVER_ADDRESS) ? SALE_RECEIVER_ADDRESS : "NO CONFIGURADO"}`);
      console.log(`PostgreSQL: conectado`);
    });
  } catch (error) {
    console.error("No se pudo iniciar el backend:", error.message);
    process.exit(1);
  }
};

start();
