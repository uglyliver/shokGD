// Pool of shop name fragments, taglines, and phone-number templates.
// Mix of Devanagari + English signage — deliberately mismatched,
// the way real Janakpuri signs are.

export const SHOP_ENGLISH = [
  "RAJESH JEWELLERS",
  "CHOPRA SONS",
  "KATARIA ELECTRONICS",
  "PREM DHABA",
  "SHARMA GENERAL STORE",
  "CLASSIC PROPERTY CONSULTANTS",
  "AGGARWAL SWEETS",
  "GUPTA MOBILE CENTRE",
  "NEW LIGHT HOUSE",
  "ROYAL TAILORS",
  "SHIV SHAKTI MEDICOS",
  "BHATIA OPTICALS",
  "JANTA STATIONERY",
  "BALAJI PHOTOSTAT",
  "DURGA CLOTH HOUSE",
  "LAXMI KIRANA STORE",
  "SETHI CAR DECOR",
  "MADAAN FURNITURE",
  "VERMA SAREE CENTRE",
  "NEW DELHI BAKERY",
];

export const SHOP_HINDI = [
  "राजेश ज्वेलर्स",
  "चोपड़ा संस",
  "कटारिया इलेक्ट्रॉनिक्स",
  "प्रेम ढाबा",
  "शर्मा जनरल स्टोर",
  "क्लासिक प्रॉपर्टी",
  "अग्रवाल स्वीट्स",
  "गुप्ता मोबाइल",
  "न्यू लाइट हाउस",
  "रॉयल टेलर्स",
  "शिव शक्ति मेडिकोज़",
  "भाटिया ऑप्टिकल्स",
  "जनता स्टेशनरी",
  "बालाजी फोटोस्टेट",
  "दुर्गा क्लॉथ हाउस",
  "लक्ष्मी किराना",
  "सेठी कार डेकोर",
  "मदान फर्नीचर",
  "वर्मा साड़ी सेंटर",
  "न्यू दिल्ली बेकरी",
];

export const TAGLINES = [
  "SALE · PURCHASE · RENTING",
  "SINCE 1987",
  "WHOLESALE & RETAIL",
  "LATEST DESIGNS",
  "ESTD. 1974",
  "BEST QUALITY · BEST PRICE",
  "HOME DELIVERY AVAILABLE",
  "GST BILL ON REQUEST",
  "ALL BRANDS AVAILABLE",
  "OPEN 7 DAYS",
];

export const SIGN_PALETTES: { bg: string; fg: string; accent: string }[] = [
  { bg: "#f1b90b", fg: "#c1121f", accent: "#0a2540" },
  { bg: "#0a2540", fg: "#f5e8b7", accent: "#e63946" },
  { bg: "#e63946", fg: "#ffffff", accent: "#ffd60a" },
  { bg: "#ffffff", fg: "#1d3557", accent: "#e63946" },
  { bg: "#2a9d8f", fg: "#ffffff", accent: "#f4a261" },
  { bg: "#264653", fg: "#e9c46a", accent: "#e76f51" },
  { bg: "#f4a261", fg: "#1d3557", accent: "#e63946" },
  { bg: "#06d6a0", fg: "#073b4c", accent: "#ef476f" },
];

export function randomPhone(rng: () => number): string {
  const seven = Array.from({ length: 8 }, () => Math.floor(rng() * 10)).join("");
  return `+91 9${Math.floor(rng() * 10)}${seven.slice(0, 4)} ${seven.slice(4)}`;
}
