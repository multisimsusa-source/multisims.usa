export type Faq = { q: string; a: string }

/** Only facts confirmed in the brief. No delivery times, refund terms or coverage claims. */
export const faqs: Faq[] = [
  {
    q: "What is the difference between an eSIM and a SIM card?",
    a: "An eSIM is a digital SIM. You receive a QR code, scan it with your phone, and the line is added without any plastic card. A SIM card is a physical card you put in your phone's SIM tray. We post SIM cards from the US by USPS, with a tracking number.",
  },
  {
    q: "How do I know if my phone supports eSIM?",
    a: "Most recent iPhones, Google Pixel and Samsung Galaxy phones support eSIM. On iPhone, look for Add eSIM under Settings, then Cellular or Mobile Service. On Android, look for an eSIM or Add mobile plan option under SIM settings. Your phone must also be carrier-unlocked. If you are unsure, choose a SIM card plan.",
  },
  {
    q: "How is my eSIM delivered?",
    a: "Your eSIM arrives as a QR code image. We email it to you and it also appears on your private order page, which you reach through the link in your confirmation email.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. You buy without an account. Every order has a private link where you can see its status and, once ready, your QR code or tracking number.",
  },
  {
    q: "What do I need to give at checkout?",
    a: "Your name, email, phone number, quantity, ZIP code and the area code you would like. We ask for both because one ZIP code can cover several area codes. For SIM cards we also need a delivery address. We never ask for a passport.",
  },
  {
    q: "Can I call numbers outside the US?",
    a: "Yes, if you add international calling to your plan before you pay. It is a small extra on top of the plan price, shown on every plan page.",
  },
  {
    q: "How do I pay?",
    a: "We accept cryptocurrency: USDT on the TRC-20 network, and Bitcoin. Your order starts as soon as the payment is confirmed on the network.",
  },
  {
    q: "What happens if my eSIM does not work?",
    a: "Open your order page and raise a support request. Tell us what is happening, for example the eSIM will not install or there is no signal, and our team will fix it, including issuing a replacement eSIM where needed.",
  },
]
