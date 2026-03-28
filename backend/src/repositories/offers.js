import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listOffers({ country, token, fiat }) {
  const conditions = [];
  const values = [];

  if (country) {
    conditions.push(`country = ?`);
    values.push(country);
  }
  if (token) {
    conditions.push(`token = ?`);
    values.push(token);
  }
  if (fiat) {
    conditions.push(`fiat = ?`);
    values.push(fiat);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const sql = `select * from offers ${where} order by created_at desc`;
  const rows = await all(sql, values);
  return rows.map((row) => sanitizeOffer(deserializeOffer(row)));
}

export async function listOffersByMaker({ makerUserId, country, token, fiat }) {
  const conditions = ["maker_user_id = ?"];
  const values = [makerUserId];

  if (country) {
    conditions.push(`country = ?`);
    values.push(country);
  }
  if (token) {
    conditions.push(`token = ?`);
    values.push(token);
  }
  if (fiat) {
    conditions.push(`fiat = ?`);
    values.push(fiat);
  }

  const where = `where ${conditions.join(" and ")}`;
  const sql = `select * from offers ${where} order by created_at desc`;
  const rows = await all(sql, values);
  return rows.map(deserializeOffer);
}

export async function createOffer(payload) {
  const {
    makerUserId,
    country,
    token,
    fiat,
    minAmount,
    maxAmount,
    premiumPercent,
    priceUsd,
    priceFiat,
    paymentMethods,
    paymentDetails
  } = payload;

  const id = randomUUID();

  await run(
    `insert into offers
      (id, maker_user_id, country, token, fiat, min_amount, max_amount, premium_percent, price_usd, price_fiat, payment_methods, payment_details)
     values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      makerUserId || null,
      country,
      token,
      fiat,
      minAmount,
      maxAmount,
      premiumPercent,
      priceUsd,
      priceFiat,
      JSON.stringify(paymentMethods || []),
      paymentDetails ? JSON.stringify(paymentDetails) : null
    ]
  );

  return getOfferById(id);
}

export async function getOfferById(id) {
  const row = await get("select * from offers where id = ?", [id]);
  return row ? deserializeOffer(row) : null;
}

function deserializeOffer(row) {
  return {
    ...row,
    payment_methods: JSON.parse(row.payment_methods || "[]"),
    payment_details: row.payment_details ? JSON.parse(row.payment_details) : null
  };
}

function sanitizeOffer(offer) {
  const { payment_details, ...rest } = offer || {};
  return rest;
}
