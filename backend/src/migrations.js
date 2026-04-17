import { run } from "./db.js";

export async function runMigrations() {
  // Core tables (create if not exists — safe to run on fresh or existing DB)
  await run(
    `create table if not exists users (
      id text primary key,
      handle text unique,
      email text unique,
      phone text,
      password_hash text,
      profile_name text,
      profile_image_url text,
      last_seen_at text,
      role text not null default 'user',
      is_verified integer not null default 0,
      verification_code text,
      verification_expires text,
      is_frozen integer not null default 0,
      freeze_reason text,
      totp_secret text,
      totp_enabled integer not null default 0,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists offers (
      id text primary key,
      maker_user_id text,
      country text not null,
      token text not null,
      fiat text not null,
      min_amount real not null,
      max_amount real not null,
      premium_percent real not null default 0,
      price_usd real not null,
      price_fiat real not null,
      status text not null default 'active',
      payment_methods text not null,
      payment_details text,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists escrows (
      id text primary key,
      offer_id text,
      seller_user_id text,
      buyer_user_id text,
      token text not null,
      amount_token real not null,
      status text not null default 'reserved',
      address text,
      txid text,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists orders (
      id text primary key,
      offer_id text,
      buyer_user_id text,
      escrow_id text,
      amount_fiat real not null,
      amount_token real not null,
      status text not null default 'awaiting_payment',
      fee_bps integer not null default 30,
      fee_amount real,
      fee_asset text,
      fee_address text,
      dispute_reason text,
      admin_note text,
      resolved_by text,
      resolved_at text,
      rejected_at text,
      expires_at text not null,
      created_at text not null default CURRENT_TIMESTAMP,
      updated_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists payments (
      id text primary key,
      order_id text,
      method text not null,
      status text not null default 'pending',
      reference text,
      note text,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists order_messages (
      id text primary key,
      order_id text not null,
      sender_id text not null,
      message text not null,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists conversations (
      id text primary key,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists conversation_participants (
      conversation_id text not null,
      user_id text not null,
      created_at text not null default CURRENT_TIMESTAMP,
      primary key (conversation_id, user_id)
    )`,
    []
  );

  await run(
    `create table if not exists conversation_messages (
      id text primary key,
      conversation_id text not null,
      sender_id text not null,
      message text not null,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists price_ticks (
      id serial primary key,
      token text not null,
      usd_price real not null,
      source text not null,
      captured_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists fx_ticks (
      id serial primary key,
      base text not null,
      quote text not null,
      rate real not null,
      source text not null,
      captured_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists wallet_addresses (
      id text primary key,
      user_id text not null,
      chain text not null,
      address text not null,
      path text not null,
      idx integer not null,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists deposits (
      id text primary key,
      address_id text not null,
      chain text not null,
      txid text not null,
      amount real not null,
      confirmations integer not null default 0,
      status text not null default 'pending',
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );
  await run(
    "create unique index if not exists deposits_chain_txid_addr_idx on deposits(chain, txid, address_id)",
    []
  );

  await run(
    `create table if not exists chain_sync (
      chain text primary key,
      last_block text,
      updated_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists platform_fees (
      asset text primary key,
      amount real not null default 0,
      updated_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_announcements (
      id text primary key,
      message text not null,
      starts_at text,
      ends_at text,
      is_active integer not null default 1,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_payment_providers (
      id text primary key,
      country_code text not null,
      method text not null,
      name text not null,
      details text,
      is_active integer not null default 1,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists balances (
      user_id text not null,
      asset text not null,
      amount real not null default 0,
      primary key (user_id, asset)
    )`,
    []
  );

  await run(
    `create table if not exists withdrawals (
      id text primary key,
      user_id text not null,
      chain text not null,
      asset text not null,
      to_address text not null,
      amount real not null,
      fee real not null,
      status text not null default 'pending',
      txid text,
      approved_by text,
      approved_at text,
      rejected_reason text,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_chains (
      id text primary key,
      code text not null unique,
      name text not null,
      kind text not null default 'evm',
      network text not null default 'testnet',
      rpc_url text,
      rpc_urls text,
      is_active integer not null default 1,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_assets (
      id text primary key,
      symbol text not null unique,
      name text not null,
      chain_code text not null,
      is_native integer not null default 0,
      contract_address text,
      coingecko_id text,
      decimals integer not null default 18,
      is_active integer not null default 1,
      deposits_enabled integer not null default 1,
      withdrawals_enabled integer not null default 1,
      fee_address text,
      fee_bps integer not null default 30,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_fiats (
      id text primary key,
      code text not null unique,
      name text not null,
      symbol text,
      is_active integer not null default 1,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  await run(
    `create table if not exists admin_countries (
      id text primary key,
      code text not null unique,
      name text not null,
      fiat_code text not null,
      is_active integer not null default 1,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );

  // Column additions (safe with IF NOT EXISTS for PostgreSQL)
  await run("alter table users add column if not exists password_hash text", []);
  await run("alter table users add column if not exists is_verified integer not null default 0", []);
  await run("alter table users add column if not exists verification_code text", []);
  await run("alter table users add column if not exists verification_expires text", []);
  await run("alter table users add column if not exists role text not null default 'user'", []);
  await run("alter table users add column if not exists profile_name text", []);
  await run("alter table users add column if not exists profile_image_url text", []);
  await run("alter table users add column if not exists last_seen_at text", []);
  await run("alter table users add column if not exists is_frozen integer not null default 0", []);
  await run("alter table users add column if not exists freeze_reason text", []);
  await run("alter table users add column if not exists totp_secret text", []);
  await run("alter table users add column if not exists totp_enabled integer not null default 0", []);
  await run("alter table offers add column if not exists payment_details text", []);
  await run("alter table orders add column if not exists dispute_reason text", []);
  await run("alter table orders add column if not exists admin_note text", []);
  await run("alter table orders add column if not exists resolved_by text", []);
  await run("alter table orders add column if not exists resolved_at text", []);
  await run("alter table orders add column if not exists rejected_at text", []);
  await run("alter table orders add column if not exists fee_bps integer not null default 30", []);
  await run("alter table orders add column if not exists fee_amount real", []);
  await run("alter table orders add column if not exists fee_asset text", []);
  await run("alter table orders add column if not exists fee_address text", []);
  await run("alter table payments add column if not exists note text", []);
  await run("alter table withdrawals add column if not exists approved_by text", []);
  await run("alter table withdrawals add column if not exists approved_at text", []);
  await run("alter table withdrawals add column if not exists rejected_reason text", []);
  await run("alter table admin_chains add column if not exists rpc_urls text", []);
  await run("alter table admin_assets add column if not exists coingecko_id text", []);
  await run("alter table admin_assets add column if not exists fee_address text", []);
  await run("alter table admin_assets add column if not exists fee_bps integer not null default 30", []);

  // ── Audit log — admin action history ─────────────────────────
  await run(
    `create table if not exists audit_log (
      id text primary key,
      actor_id text not null,
      actor_email text,
      action text not null,
      target_id text,
      target_type text,
      meta text,
      ip text,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );
  await run("create index if not exists audit_log_actor_idx on audit_log(actor_id)", []);
  await run("create index if not exists audit_log_action_idx on audit_log(action)", []);
  await run("create index if not exists audit_log_created_idx on audit_log(created_at desc)", []);

  // ── Withdrawal address whitelist ──────────────────────────────
  await run(
    `create table if not exists withdrawal_whitelist (
      id text primary key,
      user_id text not null,
      chain text not null,
      address text not null,
      label text,
      created_at text not null default CURRENT_TIMESTAMP
    )`,
    []
  );
  await run(
    "create unique index if not exists whitelist_user_chain_addr_idx on withdrawal_whitelist(user_id, chain, address)",
    []
  );
}
