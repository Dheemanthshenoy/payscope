import { formatMinorAsMajor } from "@payscope/shared";

export function formatMoney(amountMinor: string, currencyCode: string): string {
  const major = formatMinorAsMajor(BigInt(amountMinor));
  const [whole = "0", fraction = "00"] = major.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currencyCode} ${grouped}.${fraction}`;
}

export function formatDate(value: string): string {
  return value;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}
