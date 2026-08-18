/**
 * Courier tracking links.
 * Naya courier add karna ho to bas yahan ek line jodo.
 */
const COURIERS = {
  delhivery:  { name: "Delhivery",  url: (id) => `https://www.delhivery.com/track/package/${id}` },
  bluedart:   { name: "Blue Dart",  url: (id) => `https://www.bluedart.com/web/guest/trackdartresultthirdparty?trackFor=0&trackNo=${id}` },
  dtdc:       { name: "DTDC",       url: (id) => `https://www.dtdc.in/tracking/tracking_results.asp?strCnno=${id}` },
  ekart:      { name: "Ekart",      url: (id) => `https://ekartlogistics.com/shipmenttrack/${id}` },
  xpressbees: { name: "XpressBees", url: (id) => `https://www.xpressbees.com/shipment/tracking?awb=${id}` },
  shiprocket: { name: "Shiprocket", url: (id) => `https://shiprocket.co/tracking/${id}` },
  indiapost:  { name: "India Post", url: ()   => `https://www.indiapost.gov.in/_layouts/15/DOP.Portal.Tracking/TrackConsignment.aspx` },
  ecom:       { name: "Ecom Express", url: (id) => `https://ecomexpress.in/tracking/?awb_field=${id}` },
};

/** Sheet mein "Blue Dart" / "BLUEDART" / "blue-dart" — sab ek hi key pe aayein */
const normaliseCourier = (raw) =>
  String(raw || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const courierInfo = (raw) => {
  const key = normaliseCourier(raw);
  return COURIERS[key] || null;
};

/** Tracking URL — courier pehchana na jaye to khaali string */
const buildTrackingUrl = (courier, trackingId) => {
  const info = courierInfo(courier);
  if (!info || !trackingId) return "";
  try {
    return info.url(encodeURIComponent(String(trackingId).trim()));
  } catch {
    return "";
  }
};

/** Display naam — "delhivery" → "Delhivery", anjaan ho to jaisa diya waisa */
const courierName = (raw) => courierInfo(raw)?.name || String(raw || "").trim();

/**
 * Sheet mein diya hua link saaf karke lautata hai.
 *
 * Ye link seedha runner ki profile mein clickable jaata hai, isliye
 * sirf http/https hi manzoor — "javascript:" jaisa kuch chhup kar
 * andar na aa jaye. Galat ho to khaali string, taaki tuta link na dikhe.
 */
const safeTrackingUrl = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";

  // Log aksar "www.abc.com/track/123" likhte hain — https khud laga do
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname.includes(".")) return "";   // "https://abc" jaisa adhoora
    return url.toString();
  } catch {
    return "";
  }
};

/** Phone ko last 10 digits pe laao — "+91 81717-94766" aur "8171794766" match ho jaayein */
const normalisePhone = (raw) => {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

module.exports = {
  COURIERS,
  courierInfo,
  courierName,
  buildTrackingUrl,
  safeTrackingUrl,
  normalisePhone,
  supportedCouriers: Object.keys(COURIERS),
};
