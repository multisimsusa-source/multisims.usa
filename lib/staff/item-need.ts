import type { OrderItem } from "@/lib/types"

/**
 * What a SIM still needs before its order can be completed: the ICCID and tracking (posting
 * a SIM card), the phone number (activating it), or nothing for a refill (its dates default
 * to the proposal) or an eSIM (its QR code may be added after delivery). A service needs its
 * result: the QR code, or the new number. Shared by the server-rendered workspace and the
 * client item form, so it lives outside both.
 */
export type ItemNeed = "qr" | "ship" | "activate" | "refill" | "service_qr" | "service_number"

type Ready = Pick<OrderItem, "qr_path" | "tracking_number" | "iccid" | "phone_number" | "old_phone_number">

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")

export function itemReady(item: Ready, need: ItemNeed) {
  if (need === "refill") return true
  // An eSIM can be delivered before its QR code arrives; the QR is added later.
  if (need === "qr") return true
  if (need === "service_qr") return Boolean(item.qr_path)
  if (need === "service_number") return Boolean(item.phone_number) && digits(item.phone_number) !== digits(item.old_phone_number)
  if (need === "ship") return Boolean(item.tracking_number && item.iccid)
  return Boolean(item.phone_number)
}
