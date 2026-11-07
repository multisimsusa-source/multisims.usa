import type { OrderItem } from "@/lib/types"

/**
 * What a SIM still needs before its order can be completed: the ICCID and tracking (posting
 * a SIM card), the phone number (activating it), or nothing for a refill (its dates default
 * to the proposal) or an eSIM (its QR code may be added after delivery). Shared by the server-rendered workspace and the
 * client item form, so it lives outside both.
 */
export type ItemNeed = "qr" | "ship" | "activate" | "refill"

export function itemReady(item: Pick<OrderItem, "qr_path" | "tracking_number" | "iccid" | "phone_number">, need: ItemNeed) {
  if (need === "refill") return true
  // An eSIM can be delivered before its QR code arrives; the QR is added later.
  if (need === "qr") return true
  if (need === "ship") return Boolean(item.tracking_number && item.iccid)
  return Boolean(item.phone_number)
}
