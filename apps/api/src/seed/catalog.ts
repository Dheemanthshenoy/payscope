export const SEED_DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Finance",
  "HR",
  "Operations",
  "Support",
] as const;

export const SEED_COUNTRIES = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "US", name: "US", currency: "USD" },
  { code: "GB", name: "UK", currency: "GBP" },
  { code: "AE", name: "UAE", currency: "AED" },
  { code: "DE", name: "Germany", currency: "EUR" },
] as const;

export const SEED_NUMBER_PREFIX = "SEED-";
export const SEED_EMPLOYEE_COUNT = 10_000;
export const SEED_RNG = 20261015;

const FIRST_NAMES = [
  "Amina",
  "Arjun",
  "Chen",
  "Diego",
  "Elena",
  "Farah",
  "Grace",
  "Hassan",
  "Ivy",
  "Jonas",
  "Kiran",
  "Lila",
  "Mateo",
  "Nora",
  "Omar",
  "Priya",
  "Quinn",
  "Ravi",
  "Sofia",
  "Tariq",
];

const LAST_NAMES = [
  "Ahmed",
  "Becker",
  "Chaudhary",
  "Dsouza",
  "Evans",
  "Fernandez",
  "Gupta",
  "Hughes",
  "Iyer",
  "Johansson",
  "Khan",
  "Lopez",
  "Mehta",
  "Nair",
  "Okoye",
  "Patel",
  "Qureshi",
  "Reddy",
  "Singh",
  "Wright",
];

export function seedEmployeeNumber(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(5, "0")}`;
}

export function seedFullName(index: number): string {
  const first = FIRST_NAMES[(index - 1) % FIRST_NAMES.length] ?? "Alex";
  const last = LAST_NAMES[(index * 7 - 1) % LAST_NAMES.length] ?? "Person";
  return `${first} ${last}`;
}

export function seedAmountMinor(index: number): bigint {
  const band = BigInt((index * 7919) % 180_000);
  return 35_000_00n + band * 100n;
}
