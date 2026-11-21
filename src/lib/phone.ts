/**
 * WhatsApp contact normalisation (student or guardian). Not unique, not identity proof.
 * Accepts Sri Lankan mobile formats (07XXXXXXXX, 7XXXXXXXX, +947XXXXXXXX, 00947XXXXXXXX, 947XXXXXXXX)
 * with spaces/dashes/brackets, and other international numbers in +<country><number> form (8–15 digits).
 */
export type PhoneResult = { ok: true; e164: string } | { ok: false; message: string };

export function normalizePhone(raw: string): PhoneResult {
  const s = raw.trim();
  if (!s) return { ok: false, message: "Phone number is empty." };
  if (/[^\d+\s\-().]/.test(s)) return { ok: false, message: "Phone number contains invalid characters." };
  let d = s.replace(/[\s\-().]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.indexOf("+") > 0) return { ok: false, message: "'+' is only allowed at the start." };

  if (d.startsWith("+")) {
    const digits = d.slice(1);
    if (!/^\d{8,15}$/.test(digits)) return { ok: false, message: "International numbers need 8–15 digits after '+'." };
    if (digits.startsWith("94")) return sriLanka(digits.slice(2));
    return { ok: true, e164: "+" + digits };
  }
  if (/^94\d{9}$/.test(d)) return sriLanka(d.slice(2));
  if (/^0\d{9}$/.test(d)) return sriLanka(d.slice(1));
  if (/^\d{9}$/.test(d)) return sriLanka(d);
  return { ok: false, message: "Use a Sri Lankan mobile number like 0771234567 or an international number like +447700900123." };
}

function sriLanka(national: string): PhoneResult {
  // Sri Lankan mobile numbers: 7X XXX XXXX (9 digits after the country code).
  if (!/^7\d{8}$/.test(national)) return { ok: false, message: "Sri Lankan mobile numbers start with 7 and have 9 digits (e.g. 0771234567)." };
  return { ok: true, e164: "+94" + national };
}
