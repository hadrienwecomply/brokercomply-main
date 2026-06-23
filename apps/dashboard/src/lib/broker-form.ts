/**
 * Pure mapping helpers shared by the create (`new-broker-button`) and edit
 * (`edit-broker-button`) flows. Kept free of "use client"/"server-only" so it can
 * be unit-tested and imported from both client components.
 */
import type { Broker } from "./types";
import type { CreateBrokerInput, UpdateBrokerPatch } from "./brokers.server";

/** Flat string-only shape the `BrokerEditor` form binds to. */
export interface BrokerEditorValues {
  societe: string;
  contact: string;
  emails: string; // comma / newline separated in the form
  phone: string;
  website: string;
  bce: string;
  fsmaNumber: string;
  address: string;
  city: string;
  countries: string; // comma separated, e.g. "BE, LU"
  language: string; // "" | FR | NL | EN
  sizeBucket: string;
  product: string;
  status: string;
  accountOwner: string; // officer email; "" = let the server default it
  linkedinUrl: string;
  mrr: string; // free text, parsed to number on submit
  signatureDate: string; // yyyy-mm-dd
  lastContactDate: string; // yyyy-mm-dd
}

export const EMPTY_BROKER: BrokerEditorValues = {
  societe: "",
  contact: "",
  emails: "",
  phone: "",
  website: "",
  bce: "",
  fsmaNumber: "",
  address: "",
  city: "",
  countries: "BE",
  language: "FR",
  sizeBucket: "",
  product: "BrokerComply",
  status: "onboarding",
  accountOwner: "",
  linkedinUrl: "",
  mrr: "",
  signatureDate: "",
  lastContactDate: "",
};

/** Split a comma/newline separated field into a trimmed, non-empty list. */
export function toList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse a free-text MRR (FR/EN decimal + thousands separators) into a number. */
export function parseMrr(raw: string): number | null {
  const s = raw.trim().replace(/[\s€]/g, "");
  if (!s) return null;
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalized: string;
  if (hasDot && hasComma) {
    // The rightmost separator is the decimal; the other is a thousands separator.
    const decimal = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const thousands = decimal === "," ? "." : ",";
    normalized = s.split(thousands).join("").replace(decimal, ".");
  } else if (hasComma) {
    normalized = s.replace(",", "."); // "1250,50" → decimal comma
  } else {
    normalized = s; // only a dot (decimal) or neither
  }
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Pre-fill the form from a persisted broker (edit flow). */
export function brokerToValues(b: Broker): BrokerEditorValues {
  return {
    societe: b.societe,
    contact: b.contact ?? "",
    emails: b.emails.join(", "),
    phone: b.phone ?? "",
    website: b.website ?? "",
    bce: b.bce ?? "",
    fsmaNumber: b.fsmaNumber ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    countries: b.countries.join(", "),
    language: b.language ?? "",
    sizeBucket: b.sizeBucket ?? "",
    product: b.product ?? "BrokerComply",
    status: b.status ?? "onboarding",
    accountOwner: b.officerId ?? "",
    linkedinUrl: b.linkedinUrl ?? "",
    mrr: b.mrr != null ? String(b.mrr) : "",
    signatureDate: b.signatureDate ?? "",
    lastContactDate: b.lastContactDate ?? "",
  };
}

/** Form values → create payload (omits empty accountOwner so the server defaults it). */
export function valuesToCreateInput(values: BrokerEditorValues): CreateBrokerInput {
  return {
    societe: values.societe,
    contact: values.contact,
    emails: toList(values.emails),
    countries: toList(values.countries),
    phone: values.phone,
    website: values.website,
    bce: values.bce,
    fsmaNumber: values.fsmaNumber,
    address: values.address,
    city: values.city,
    language: values.language,
    sizeBucket: values.sizeBucket,
    product: values.product,
    status: values.status,
    accountOwner: values.accountOwner || undefined,
    linkedinUrl: values.linkedinUrl,
    mrr: parseMrr(values.mrr),
    signatureDate: values.signatureDate || null,
    lastContactDate: values.lastContactDate || null,
  };
}

/** Form values → full update patch (every editable field is sent). */
export function valuesToPatch(values: BrokerEditorValues): UpdateBrokerPatch {
  return {
    societe: values.societe,
    contact: values.contact,
    emails: toList(values.emails),
    countries: toList(values.countries),
    phone: values.phone,
    website: values.website,
    bce: values.bce,
    fsmaNumber: values.fsmaNumber,
    address: values.address,
    city: values.city,
    language: values.language,
    sizeBucket: values.sizeBucket,
    product: values.product,
    status: values.status,
    accountOwner: values.accountOwner || null,
    linkedinUrl: values.linkedinUrl,
    mrr: parseMrr(values.mrr),
    signatureDate: values.signatureDate || null,
    lastContactDate: values.lastContactDate || null,
  };
}
