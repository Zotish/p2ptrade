import rateLimit from "express-rate-limit";

// ─── General API — সব route-এ প্রযোজ্য ──────────────────────────
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 মিনিট
  max: 200,                    // প্রতি IP থেকে 200 request
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." }
});

// ─── Auth routes — login/signup brute force protection ───────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 মিনিট
  max: 10,                     // মাত্র ১০টা attempt
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  skipSuccessfulRequests: true // সফল login গুনবে না
});

// ─── Signup — নতুন account তৈরি limit ────────────────────────────
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // ১ ঘণ্টা
  max: 5,                      // প্রতি IP থেকে ৫টা account
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created. Try again in 1 hour." }
});

// ─── Verification code — spam protection ─────────────────────────
export const verifyLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,    // ৫ মিনিট
  max: 5,                      // ৫ বার চেষ্টা
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Wait 5 minutes." }
});

// ─── Withdrawal — financial action ───────────────────────────────
export const withdrawLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // ১ ঘণ্টা
  max: 10,                     // ১০টা withdrawal request
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many withdrawal requests. Try again later." }
});
