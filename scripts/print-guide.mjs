// Prints docs/product-guide/product-guide.html to MultiSims-USA-Product-Guide.pdf with Chromium.
//   node scripts/print-guide.mjs
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const dir = fileURLToPath(new URL("../docs/product-guide", import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file://${dir}/product-guide.html`, { waitUntil: "networkidle" })
await page.evaluate(() => document.fonts.ready)
const footer = `<div style="width:100%; padding:0 18mm; font-family:Helvetica,Arial,sans-serif; font-size:7.5pt; color:#7a7282; display:flex; justify-content:space-between;"><span>MultiSims USA product guide</span><span><span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`
await page.pdf({ path: `${dir}/MultiSims-USA-Product-Guide.pdf`, format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer })
await browser.close()
console.log("printed")
