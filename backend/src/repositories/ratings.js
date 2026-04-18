import { run, get } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createRating({ orderId, raterUserId, ratedUserId, stars, comment }) {
  const id = randomUUID();
  await run(
    `insert into ratings (id, order_id, rater_user_id, rated_user_id, stars, comment)
     values (?, ?, ?, ?, ?, ?)`,
    [id, orderId, raterUserId, ratedUserId, stars, comment || null]
  );
  return { id, orderId, raterUserId, ratedUserId, stars, comment: comment || null };
}

export async function getRatingByOrder(orderId) {
  return get("select * from ratings where order_id = ?", [orderId]);
}

export async function getSellerRatingStats(sellerUserId) {
  const row = await get(
    `select count(*) as total_ratings, avg(stars) as avg_stars
     from ratings
     where rated_user_id = ?`,
    [sellerUserId]
  );
  return {
    totalRatings: Number(row?.total_ratings || 0),
    avgStars: row?.avg_stars ? Number(Number(row.avg_stars).toFixed(1)) : null
  };
}
