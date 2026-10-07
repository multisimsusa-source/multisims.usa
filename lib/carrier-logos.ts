/**
 * Built-in logos for well-known US carriers, used until the admin uploads one.
 * Matched on the carrier's name (not its slug, which the admin can change), so
 * "T-Mobile", "t mobile" and "TMobile" all find the same file. Aspect ratios come
 * from each SVG's tight viewBox and drive optical sizing in <CarrierLogo>.
 */
const BUNDLED: Record<string, { file: string; aspect: number }> = {
  tmobile: { file: "/carriers/tmobile.svg", aspect: 4.863 },
  verizon: { file: "/carriers/verizon.svg", aspect: 4.461 },
  att: { file: "/carriers/att.svg", aspect: 2.433 },
  lycamobile: { file: "/carriers/lycamobile.svg", aspect: 2.558 },
  mintmobile: { file: "/carriers/mintmobile.svg", aspect: 5.371 },
  ultramobile: { file: "/carriers/ultramobile.svg", aspect: 2.49 },
}

export function bundledCarrierLogo(name: string) {
  const key = name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]/g, "")
  return BUNDLED[key] ?? null
}
