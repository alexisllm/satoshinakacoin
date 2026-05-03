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
