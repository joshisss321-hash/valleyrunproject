/**
 * Bahar se aaya hua link saaf karke lautata hai.
 *
 * Ye link emails aur pages mein clickable jaata hai, isliye sirf
 * http/https manzoor — "javascript:" jaisa kuch chhup kar andar na
 * aa jaye. Galat ho to khaali string, taaki toota link na dikhe.
 */
const safeUrl = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";

  // Log aksar "chat.whatsapp.com/ABC" likhte hain — https khud laga do
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";
    return url.toString();
  } catch {
    return "";
  }
};

module.exports = { safeUrl };
