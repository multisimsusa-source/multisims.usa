import type { OrderItem } from "@/lib/types"

/**
 * What a SIM still needs before its order can be completed: the QR (eSIM), the ICCID and
 * tracking (posting a SIM card), or the phone number (activating it). Shared by the
 * server-rendered workspace and the client item form, so it lives outside both.
 */
export type ItemNeed = "qr" | "ship" | "activate"

export function itemReady(item: Pick<OrderItem, "qr_path" | "tracking_number" | "iccid" | "phone_number">, need: ItemNeed) {
  if (need === "qr") return Boolean(item.qr_path)
  if (need === "ship") return Boolean(item.tracking_number && item.iccid)
  return Boolean(item.phone_number)
}
