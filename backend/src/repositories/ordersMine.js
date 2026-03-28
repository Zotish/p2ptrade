import { all } from "../db.js";

function mapOrder(row) {
  if (!row) return row;
  return {
    ...row,
    offer: {
      token: row.offer_token,
      fiat: row.offer_fiat,
      country: row.offer_country,
      price_fiat: row.offer_price_fiat,
      maker_user_id: row.offer_maker_user_id,
      payment_methods: (() => { try { return JSON.parse(row.offer_payment_methods || "[]"); } catch { return []; } })(),
      payment_details: (() => { try { return JSON.parse(row.offer_payment_details || "{}"); } catch { return {}; } })()
    },
    buyer: row.buyer_id ? {
      id: row.buyer_id,
      email: row.buyer_email,
      handle: row.buyer_handle,
      full_name: row.buyer_full_name,
      phone: row.buyer_phone
    } : null,
    payment: row.pay_id ? {
      id: row.pay_id,
      method: row.pay_method,
      reference: row.pay_reference,
      note: row.pay_note,
      status: row.pay_status
    } : null
  };
}

const ORDER_JOINS = `
  left join payments p on p.order_id = o.id
  left join users b on b.id = o.buyer_user_id
`;

const ORDER_COLUMNS = `
  o.*,
  of.token           as offer_token,
  of.fiat            as offer_fiat,
  of.country         as offer_country,
  of.price_fiat      as offer_price_fiat,
  of.maker_user_id   as offer_maker_user_id,
  of.payment_methods as offer_payment_methods,
  of.payment_details as offer_payment_details,
  b.id               as buyer_id,
  b.email            as buyer_email,
  b.handle           as buyer_handle,
  b.profile_name     as buyer_full_name,
  b.phone            as buyer_phone,
  p.id               as pay_id,
  p.method           as pay_method,
  p.reference        as pay_reference,
  p.note             as pay_note,
  p.status           as pay_status
`;

export async function listOrdersByBuyer(userId, fiat) {
  const conditions = ["o.buyer_user_id = ?"];
  const values = [userId];
  if (fiat) { conditions.push("of.fiat = ?"); values.push(fiat); }
  const sql = `
    select ${ORDER_COLUMNS}
    from orders o
    join offers of on of.id = o.offer_id
    ${ORDER_JOINS}
    where ${conditions.join(" and ")}
    order by o.created_at desc
  `;
  const rows = await all(sql, values);
  return rows.map(mapOrder);
}

export async function listOrdersBySeller(userId, fiat) {
  const conditions = ["of.maker_user_id = ?"];
  const values = [userId];
  if (fiat) { conditions.push("of.fiat = ?"); values.push(fiat); }
  const sql = `
    select ${ORDER_COLUMNS}
    from orders o
    join offers of on of.id = o.offer_id
    ${ORDER_JOINS}
    where ${conditions.join(" and ")}
    order by o.created_at desc
  `;
  const rows = await all(sql, values);
  return rows.map(mapOrder);
}
