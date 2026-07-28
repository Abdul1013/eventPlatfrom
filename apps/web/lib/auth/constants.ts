// Cookie names, shared by the Edge proxy (jose-only) and the Node session layer
// (Prisma). Kept in its own module so importing them into the Edge runtime does
// not drag in `server-only`/Prisma.
export const ACCESS_COOKIE = "em_access";
export const REFRESH_COOKIE = "em_refresh";
