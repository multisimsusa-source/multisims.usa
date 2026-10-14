/**
 * Terms and Refund Policy text. Kept here as plain data so wording can be changed after
 * the client's review without touching page code. Each section is a heading and its
 * paragraphs; a paragraph may be a list of points instead of a sentence.
 *
 * Draft for the client's review (14 Oct 2026). No em dashes in this copy.
 */

export type LegalSection = { heading: string; body: (string | string[])[] }
export type LegalDocument = { title: string; description: string; updated: string; sections: LegalSection[] }

export const refundPolicy: LegalDocument = {
  title: "Refund Policy",
  description: "When we refund an order, how refunds are sent, and what cannot be refunded.",
  updated: "14 October 2026",
  sections: [
    {
      heading: "How payments and refunds work",
      body: [
        "We take payment in cryptocurrency: USDT on the TRC-20 network, and Bitcoin. Crypto payments cannot be reversed by the network or by your wallet provider.",
        "When a refund is due, we send it by hand in crypto to a wallet address you give us. We refund in the coin you paid with, for the US dollar amount of the order, unless we agree otherwise with you by email.",
      ],
    },
    {
      heading: "eSIMs",
      body: [
        "If your eSIM does not install, does not activate or has no signal, raise a support request from your order page. We will fix it, which can include sending you a replacement eSIM. We send up to 2 replacements per order.",
        "If a replacement does not fix the problem, we refund the eSIM.",
        "An eSIM that has been installed and works is not refundable.",
      ],
    },
    {
      heading: "SIM cards",
      body: [
        "You can cancel a SIM card order and get a full refund until it ships. Once it has shipped, the SIM card is not refundable, except when a replacement does not fix a fault with the line, as for eSIMs.",
      ],
    },
    {
      heading: "Fees",
      body: ["The network fee and shipping are not refundable once your order has been sent to you."],
    },
    {
      heading: "Plans and days",
      body: [
        "Plans are sold by the day and count from activation. Days you do not use are not refunded.",
        "If the area code you asked for is not available, we deliver the nearest available one. This is not a reason for a refund.",
      ],
    },
    {
      heading: "Payments we cannot accept",
      body: [
        "Orders below our minimum order amount cannot be placed. If you send less than the order total, the order does not start; we contact you by email about the difference or a refund.",
        "If you send more than the order total, contact us and we will refund the difference.",
      ],
    },
    {
      heading: "How to ask for a refund",
      body: [
        "Use the support form on your order page, or contact us. Include your order number (for example MS-10421) and the wallet address for the refund. We reply by email.",
      ],
    },
  ],
}

export const terms: LegalDocument = {
  title: "Terms",
  description: "The terms that apply when you buy a SIM card or eSIM from MultiSims USA.",
  updated: "14 October 2026",
  sections: [
    {
      heading: "About these terms",
      body: [
        "These terms apply when you buy a US SIM card or eSIM on this website. By paying for an order you agree to them and to our Refund Policy.",
      ],
    },
    {
      heading: "What you buy",
      body: [
        "You buy a prepaid line on a US carrier's network for the number of days you choose. The carrier's own coverage and fair use rules apply to your line. Coverage, speeds and hotspot allowances are set by the carrier and can vary by location.",
        "SIM cards are posted by USPS to a US address. eSIMs are delivered as a QR code by email and on your private order page.",
      ],
    },
    {
      heading: "Prices and payment",
      body: [
        "Prices are in US dollars and shown at checkout before you pay. Your total is made up of:",
        [
          "the plan, for the days you chose, for each SIM",
          "international calling, if you add it",
          "the SIM card price, for each physical SIM",
          "shipping, once per SIM card order",
          "a network fee, once per order",
        ],
        "You pay in USDT on the TRC-20 network or in Bitcoin, through our payment partner. Your order starts once the payment is confirmed on the network. Orders below our minimum order amount cannot be placed.",
      ],
    },
    {
      heading: "Area codes",
      body: [
        "You can ask for an area code. If it is not available, we deliver the nearest available area code.",
      ],
    },
    {
      heading: "When your plan starts",
      body: [
        "eSIM plans count from activation.",
        "For SIM cards you choose at checkout when the plan should start: when you receive the SIM, or on a date. If you choose when you receive it, press the button on your order page once the SIM is in your hands, and your plan days start then.",
      ],
    },
    {
      heading: "Your order page",
      body: [
        "Every order has a private link that shows its status, your QR codes or tracking number, and your phone numbers. Anyone with the link can see your order, so keep it to yourself. Never share an eSIM QR code: anyone who scans it can install your line.",
      ],
    },
    {
      heading: "Problems and replacements",
      body: [
        "If something does not work, raise a support request from your order page. We may send a replacement eSIM or SIM card. Refunds follow our Refund Policy.",
      ],
    },
    {
      heading: "Using your line",
      body: [
        "Use your line lawfully and within the carrier's rules. The carrier may suspend a line that breaks its rules, and we cannot refund a line suspended for that reason.",
      ],
    },
    {
      heading: "Changes",
      body: ["We may update these terms. The version shown when you paid applies to your order."],
    },
    {
      heading: "Contact",
      body: ["Questions about these terms? Contact us through the contact page and we reply by email."],
    },
  ],
}
