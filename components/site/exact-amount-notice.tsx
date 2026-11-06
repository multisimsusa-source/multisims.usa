import { Notice } from "@/components/patterns/notice"

/**
 * Shown next to every crypto pay button. The payment partner adds the coin's network fee on
 * its own page, so it asks for more than our total; a buyer who sends the round total pays
 * short, and the order (or top-up) then waits on the owner.
 */
export function ExactAmountNotice({ topUp = false, className }: { topUp?: boolean; className?: string }) {
  return (
    <Notice tone="info" title="Send the exact amount the payment page shows" className={className}>
      {topUp
        ? "It includes the network fee for your coin, so it is more than the amount you enter. If you send less, your balance only goes up by what arrives after fees."
        : "It includes the network fee for your coin, so it is more than this total. If you send less, your order waits until we contact you."}
    </Notice>
  )
}
