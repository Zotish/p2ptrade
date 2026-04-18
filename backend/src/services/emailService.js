import { Resend } from "resend";
import { config } from "../config.js";

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

// ── HTML Template ────────────────────────────────────────────
function verificationTemplate({ code, email, expiresMinutes = 15 }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#0f1015;font-family:'Segoe UI',Arial,sans-serif;color:#f1f2f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1015;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0"
          style="max-width:520px;width:100%;background:#1a1c25;border-radius:16px;border:1px solid #2b2f3b;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#1d2130,#1a1c25);padding:32px 40px;text-align:center;border-bottom:1px solid #2b2f3b;">
              <p style="margin:0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#f4b740;font-weight:700;">P2P ESCROW</p>
              <h1 style="margin:12px 0 0;font-size:22px;color:#f1f2f6;font-weight:600;">Verify your email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 28px;color:#8f95a3;font-size:14px;line-height:1.6;">
                Use the code below to verify <strong style="color:#f1f2f6;">${email}</strong> and complete your registration.
              </p>
              <div style="background:#0f1015;border:1px solid #2b2f3b;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8f95a3;">Verification Code</p>
                <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:12px;color:#f4b740;font-family:'Courier New',monospace;">${code}</p>
              </div>
              <p style="margin:0;font-size:13px;color:#8f95a3;text-align:center;">
                ⏱ Expires in <strong style="color:#f1f2f6;">${expiresMinutes} minutes</strong> &nbsp;·&nbsp;
                If you didn't request this, ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #2b2f3b;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4a4f5e;">© ${new Date().getFullYear()} P2P Escrow · Safe crypto trading</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Main export ──────────────────────────────────────────────
export async function sendVerificationEmail({ email, code }) {
  // Resend available হলে try করো
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: config.emailFrom,
        to: email,
        subject: `${code} — Your P2P Escrow verification code`,
        html: verificationTemplate({ code, email })
      });
      if (error) throw new Error(error.message);
      console.log(`[email] Sent to ${email} (id: ${data?.id})`);
      return { ok: true, id: data?.id };
    } catch (err) {
      console.warn(`[email] Resend failed: ${err.message}`);
    }
  }

  // DEV fallback — terminal-এ code দেখাও
  console.log("\n─────────────────────────────────────────");
  console.log(`📧  Verification code for: ${email}`);
  console.log(`🔑  CODE: ${code}`);
  console.log("─────────────────────────────────────────\n");
  return { ok: true, dev: true };
}

export async function sendPasswordResetEmail({ email, code }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Reset Password</title></head>
<body style="margin:0;padding:0;background:#0f1015;font-family:'Segoe UI',Arial,sans-serif;color:#f1f2f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1015;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#1a1c25;border-radius:16px;border:1px solid #2b2f3b;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1d2130,#1a1c25);padding:32px 40px;text-align:center;border-bottom:1px solid #2b2f3b;">
          <p style="margin:0;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#f4b740;font-weight:700;">P2P ESCROW</p>
          <h1 style="margin:12px 0 0;font-size:22px;color:#f1f2f6;font-weight:600;">Reset your password</h1>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 28px;color:#8f95a3;font-size:14px;line-height:1.6;">Use the code below to reset the password for <strong style="color:#f1f2f6;">${email}</strong>.</p>
          <div style="background:#0f1015;border:1px solid #2b2f3b;border-radius:12px;padding:28px;text-align:center;margin:0 0 28px;">
            <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8f95a3;">Reset Code</p>
            <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:12px;color:#f4b740;font-family:'Courier New',monospace;">${code}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#8f95a3;text-align:center;">⏱ Expires in <strong style="color:#f1f2f6;">15 minutes</strong> &nbsp;·&nbsp; If you didn't request this, ignore this email.</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #2b2f3b;text-align:center;">
          <p style="margin:0;font-size:12px;color:#4a4f5e;">© ${new Date().getFullYear()} P2P Escrow · Safe crypto trading</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: config.emailFrom,
        to: email,
        subject: `${code} — Your P2P Escrow password reset code`,
        html
      });
      if (error) throw new Error(error.message);
      return { ok: true, id: data?.id };
    } catch (err) {
      console.warn(`[email] Password reset email failed: ${err.message}`);
    }
  }
  console.log("\n─────────────────────────────────────────");
  console.log(`🔑  Password reset code for: ${email}`);
  console.log(`📋  CODE: ${code}`);
  console.log("─────────────────────────────────────────\n");
  return { ok: true, dev: true };
}

// ── Trade event emails ────────────────────────────────────────

function tradeEmailBase(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0f1015;font-family:'Segoe UI',Arial,sans-serif;color:#f1f2f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1015;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#1a1c25;border-radius:16px;border:1px solid #2b2f3b;overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#1d2130,#1a1c25);padding:24px 40px;text-align:center;border-bottom:1px solid #2b2f3b;">
          <p style="margin:0;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#f4b740;font-weight:700;">P2P ESCROW</p>
          <h1 style="margin:10px 0 0;font-size:20px;color:#f1f2f6;font-weight:600;">${title}</h1>
        </td></tr>
        <tr><td style="padding:32px 40px;">${bodyHtml}</td></tr>
        <tr><td style="padding:16px 40px;border-top:1px solid #2b2f3b;text-align:center;">
          <p style="margin:0;font-size:12px;color:#4a4f5e;">© ${new Date().getFullYear()} P2P Escrow · Safe crypto trading</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendTradeEmail({ to, subject, title, bodyHtml }) {
  if (!to) return;
  const html = tradeEmailBase(title, bodyHtml);
  if (resend) {
    try {
      await resend.emails.send({ from: config.emailFrom, to, subject, html });
      return;
    } catch (err) {
      console.warn(`[email] Trade notification failed: ${err.message}`);
    }
  }
  console.log(`[email-dev] ${subject} → ${to}`);
}

export async function sendOrderCreatedEmail({ sellerEmail, orderId, amountFiat, fiat, token, buyerHandle }) {
  await sendTradeEmail({
    to: sellerEmail,
    subject: `New order received — ${amountFiat} ${fiat}`,
    title: "New Order Received",
    bodyHtml: `<p style="color:#8f95a3;font-size:14px;line-height:1.7;">
      A buyer${buyerHandle ? ` (@${buyerHandle})` : ""} has created an order for
      <strong style="color:#f1f2f6;">${amountFiat} ${fiat}</strong>
      worth of <strong style="color:#f1f2f6;">${token}</strong>.<br/><br/>
      Order ID: <code style="color:#f4b740;">${orderId.slice(0,8)}</code><br/><br/>
      Please log in to confirm the payment once received.
    </p>`
  });
}

export async function sendPaymentSubmittedEmail({ sellerEmail, orderId, amountFiat, fiat, method, reference }) {
  await sendTradeEmail({
    to: sellerEmail,
    subject: `Payment submitted — check your ${method?.replace(/_/g," ")} account`,
    title: "Payment Submitted",
    bodyHtml: `<p style="color:#8f95a3;font-size:14px;line-height:1.7;">
      The buyer has submitted payment proof for order
      <code style="color:#f4b740;">${orderId.slice(0,8)}</code>.<br/>
      Amount: <strong style="color:#f1f2f6;">${amountFiat} ${fiat}</strong><br/>
      Method: <strong style="color:#f1f2f6;">${(method||"").replace(/_/g," ")}</strong><br/>
      ${reference ? `Reference: <strong style="color:#f1f2f6;">${reference}</strong><br/>` : ""}
      <br/>Log in to verify and confirm the payment.
    </p>`
  });
}

export async function sendOrderReleasedEmail({ buyerEmail, orderId, amountToken, token }) {
  await sendTradeEmail({
    to: buyerEmail,
    subject: `Your ${amountToken} ${token} has been released`,
    title: "Trade Complete!",
    bodyHtml: `<p style="color:#8f95a3;font-size:14px;line-height:1.7;">
      The seller has confirmed your payment. Your escrow has been released.<br/><br/>
      <strong style="color:#f4b740;font-size:24px;">${amountToken} ${token}</strong><br/><br/>
      Order ID: <code style="color:#f4b740;">${orderId.slice(0,8)}</code><br/><br/>
      The crypto has been credited to your platform balance.
    </p>`
  });
}

export async function sendPaymentRejectedEmail({ buyerEmail, orderId, amountFiat, fiat }) {
  await sendTradeEmail({
    to: buyerEmail,
    subject: `Your payment was rejected — Order ${orderId.slice(0,8)}`,
    title: "Payment Rejected",
    bodyHtml: `<p style="color:#8f95a3;font-size:14px;line-height:1.7;">
      The seller has rejected your payment for order
      <code style="color:#f4b740;">${orderId.slice(0,8)}</code>
      (${amountFiat} ${fiat}).<br/><br/>
      <strong style="color:#f1f2f6;">If you already sent the money</strong>, please log in and raise a dispute.
      Admin will review within 24 hours.<br/><br/>
      If you made a mistake, you may cancel the order.
    </p>`
  });
}

export async function sendDisputeRaisedEmail({ sellerEmail, adminEmail, orderId, reason, amountFiat, fiat }) {
  const body = `<p style="color:#8f95a3;font-size:14px;line-height:1.7;">
    A dispute has been raised on order
    <code style="color:#f4b740;">${orderId.slice(0,8)}</code>
    (${amountFiat} ${fiat}).<br/>
    ${reason ? `Reason: <strong style="color:#f1f2f6;">${reason}</strong><br/>` : ""}
    <br/>Admin will review and resolve the dispute.
  </p>`;
  await Promise.all([
    sellerEmail ? sendTradeEmail({ to: sellerEmail, subject: `Dispute raised — Order ${orderId.slice(0,8)}`, title: "Dispute Raised", bodyHtml: body }) : Promise.resolve(),
    adminEmail  ? sendTradeEmail({ to: adminEmail,  subject: `[Admin] Dispute — Order ${orderId.slice(0,8)}`, title: "Dispute Requires Review", bodyHtml: body }) : Promise.resolve()
  ]);
}
