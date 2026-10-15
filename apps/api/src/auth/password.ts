import argon2 from "argon2";

function argon2Options() {
  const isTest = process.env.NODE_ENV === "test";
  return {
    type: argon2.argon2id,
    memoryCost: isTest ? 4096 : 19456,
    timeCost: isTest ? 1 : 2,
    parallelism: 1,
  };
}

let dummyHashPromise: Promise<string> | undefined;

function dummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash("payscope-dummy-password", argon2Options());
  return dummyHashPromise;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argon2Options());
}

export async function verifyPassword(
  hash: string | undefined,
  password: string,
): Promise<boolean> {
  const candidate = hash ?? (await dummyHash());
  try {
    return await argon2.verify(candidate, password);
  } catch {
    return false;
  }
}
