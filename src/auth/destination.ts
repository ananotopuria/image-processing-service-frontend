// Only known History destinations survive sign-in. Other sign-ins keep Dashboard.
export function authDestination(state: unknown): string {
  if (!state || typeof state !== "object" || !("returnTo" in state) || typeof state.returnTo !== "string") return "/dashboard";
  const value = state.returnTo;
  if (value === "/images") return value;
  if (/^\/images\?view=(all|favorites|received|sent)(&shareId=[a-f\d]{24})?$/i.test(value)) return value;
  return "/dashboard";
}
