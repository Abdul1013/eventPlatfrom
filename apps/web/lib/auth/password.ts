import bcrypt from "bcryptjs";

// 12 rounds mirrors EventFlow's setting. bcryptjs (pure JS) avoids native-build
// friction on serverless targets.
const BCRYPT_ROUNDS = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
