/* Medal Store ka order confirmation email.

   Jaan-bujh kar saadha: ek rang, ek table, koi nacheez banner nahi.
   Log ise isliye kholte hain ki unhe order number aur kab aayega ye
   dekhna hota hai — wahi sabse upar hona chahiye. */

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

const esc = (s) =>
  String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

module.exports = ({ order, settings = {} }) => {
  const addr = order.address || {};
  const lines = [addr.line1, addr.line2, addr.landmark, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .map(esc)
    .join(", ");

  const items = (order.items || [])
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee">
          ${i.image ? `<img src="${esc(i.image)}" width="54" height="54" alt=""
             style="border-radius:8px;object-fit:cover;vertical-align:middle;margin-right:12px">` : ""}
          <span style="vertical-align:middle">
            <strong>${esc(i.name)}</strong><br>
            <span style="color:#888;font-size:13px">${i.qty} × ${money(i.unitPrice)}</span>
          </span>
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">
          <strong>${money(i.lineTotal)}</strong>
        </td>
      </tr>`
    )
    .join("");

  /* Gift ka order — khareedne wale ko yaad dilana ki parcel kisi
     aur ke paas ja raha hai, warna wo apne darwaze par intezaar
     karta rehta hai. */
  const isGift = String(order.customerNote || "").startsWith("GIFT —");

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.07)">

    <div style="background:#171717;padding:30px 32px">
      <div style="color:#f87171;font-size:11px;font-weight:bold;letter-spacing:2px;text-transform:uppercase">
        Valley Run Medal Store
      </div>
      <h1 style="color:#fff;margin:10px 0 0;font-size:23px">Your order is confirmed</h1>
      <div style="color:rgba(255,255,255,.65);font-size:14px;margin-top:8px">
        Order <strong style="color:#fff">${esc(order.orderNo)}</strong>
      </div>
    </div>

    <div style="padding:28px 32px;color:#444;line-height:1.7;font-size:14px">
      <p style="margin:0 0 20px">Hello ${esc(order.name) || "there"}, thank you — we have your order.</p>

      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        ${items}
        <tr>
          <td style="padding:12px 0;color:#777">Subtotal</td>
          <td style="padding:12px 0;text-align:right">${money(order.subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:0 0 12px;color:#777">Shipping</td>
          <td style="padding:0 0 12px;text-align:right">
            ${order.shipping > 0 ? money(order.shipping) : "Free"}
          </td>
        </tr>
        <tr>
          <td style="padding:14px 0 0;border-top:2px solid #171717;font-size:16px"><strong>Total paid</strong></td>
          <td style="padding:14px 0 0;border-top:2px solid #171717;text-align:right;font-size:16px">
            <strong>${money(order.total)}</strong>
          </td>
        </tr>
      </table>

      ${
        isGift
          ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin-top:22px">
               <strong style="color:#92400e">🎁 This is going out as a gift</strong>
               <div style="color:#b45309;font-size:13px;margin-top:5px;line-height:1.6">
                 We will leave the price out of the parcel and put your message on the card.
                 It goes to the address below — not to you.
               </div>
             </div>`
          : ""
      }

      <div style="background:#faf9f7;border-radius:10px;padding:16px;margin-top:${isGift ? 14 : 24}px">
        <div style="font-size:11px;font-weight:bold;letter-spacing:1px;color:#999;text-transform:uppercase">
          ${isGift ? "Gift going to" : "Delivering to"}
        </div>
        <div style="margin-top:7px">
          <strong>${esc(order.name)}</strong><br>
          ${lines}<br>
          ${esc(order.phone)}
        </div>
      </div>

      <p style="margin:22px 0 0;color:#666">
        ${esc(settings.dispatchNote || "We will email your tracking number once your medal is dispatched.")}
      </p>

      ${
        settings.supportEmail || settings.supportPhone
          ? `<p style="margin:16px 0 0;color:#888;font-size:13px">
               Questions? ${esc(settings.supportEmail || "")}${
               settings.supportEmail && settings.supportPhone ? " · " : ""
             }${esc(settings.supportPhone || "")}
             </p>`
          : ""
      }
    </div>

    <div style="background:#faf9f7;padding:18px 32px;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center">
      <strong>Valley Run</strong> · <a href="https://www.valleyrun.in" style="color:#dc2626;text-decoration:none">valleyrun.in</a>
    </div>
  </div>
</body></html>`;
};
