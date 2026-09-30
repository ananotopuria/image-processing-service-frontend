// Pricing links to the protected History route. Accept only this exact intended
// destination; ordinary sign-ins retain their existing Dashboard destination.
export function authDestination(state: unknown): "/images" | "/dashboard" {
  return state !== null && typeof state === "object" && "returnTo" in state && state.returnTo === "/images"
    ? "/images" : "/dashboard";
}
