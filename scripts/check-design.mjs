#!/usr/bin/env node
/**
 * Design system checks (DESIGN.md, "Rules the checker enforces"). Runs with `bun run lint`.
 *
 * Scans app/ and components/ (not components/ui, the vendored primitives) for things the
 * design system bans. To allow a deliberate exception, put `design-allow: <rule>` and a
 * reason in a comment on the same line or the line above.
 *
 *   node scripts/check-design.mjs            check everything
 *   node scripts/check-design.mjs <files...> check only these files
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = new URL("..", import.meta.url).pathname
const SCAN = ["app", "components"]
const SKIP = [/^components\/ui\//, /^app\/(icon|opengraph-image)\.tsx$/]

const PALETTE = "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone"
const UTIL = "text|bg|border|ring|fill|stroke|outline|decoration|from|via|to|divide|placeholder|caret|accent|shadow"

/** Each rule: id, message, and a test over the file text returning [index, match] pairs. */
const rules = [
  {
    id: "color-literal",
    message: "Hard-coded colour. Use a token from app/globals.css (bg-brand, text-muted-foreground, bg-danger-soft...).",
    re: new RegExp(String.raw`-\[#[0-9a-fA-F]{3,8}\]|["'\x60]#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?["'\x60]|\b(?:oklch|rgba?|hsla?)\(`, "g"),
  },
  {
    id: "color-palette",
    message: "Tailwind default palette colour. Use the semantic tokens (success/warning/danger -soft and -ink, brand, muted).",
    re: new RegExp(String.raw`\b(?:${UTIL})-(?:${PALETTE})-\d{2,3}\b|\b(?:text|bg|border)-black\b`, "g"),
  },
  {
    id: "shadow",
    message: "Heavy shadow. Surfaces are flat with 1px borders; only popovers and menus use shadow-pop.",
    re: /\bshadow-(?:sm|md|lg|xl|2xl|inner)\b/g,
  },
  {
    id: "gradient",
    message: "Gradient. The design is flat; the one soft hero wash is allow-listed.",
    re: /\bbg-(?:gradient|linear|radial|conic)-|\b(?:linear|radial|conic)-gradient\(/g,
  },
  { id: "lucide", message: "Lucide icon. Use Phosphor (@phosphor-icons/react, /ssr in server components).", re: /from\s+["']lucide-react["']/g },
  { id: "native-select", message: "Native <select>. Use the shadcn Select (components/ui/select).", re: /<select\b/g },
  { id: "dash", message: "Em or en dash in UI. Use a comma, colon, full stop or 'to' instead.", re: /[–—]/g },
  { id: "emoji", message: "Emoji. Use a Phosphor icon or plain words.", re: /\p{Extended_Pictographic}/gu },
]

/** Controls take their height from --control-h (DESIGN.md, Density). */
function controlHeights(text) {
  const out = []
  const tag = /<(Input|SelectTrigger|Textarea|Button)\b/g
  let m
  while ((m = tag.exec(text))) {
    let i = tag.lastIndex
    let depth = 0
    let quote = null
    for (; i < text.length; i++) {
      const c = text[i]
      if (quote) {
        if (c === quote && text[i - 1] !== "\\") quote = null
      } else if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0) break
    }
    const body = text.slice(m.index, i)
    if (m[1] === "Button" && !/size="(?:lg|xl)"/.test(body)) continue
    const h = body.match(/(?<![\w-])(?:[\w[\]=:-]+:)?h-(?:\d+(?:\.\d+)?|\[[^\]]+\])(?![\w-])/)
    if (h) out.push([m.index + body.indexOf(h[0]), h[0]])
  }
  return out
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : files(path)
    return /\.(tsx|ts|jsx|js|css)$/.test(name) ? [path] : []
  })
}

const targets = (process.argv.length > 2 ? process.argv.slice(2).map((p) => join(ROOT, p)) : SCAN.flatMap((d) => files(join(ROOT, d))))
  .map((abs) => relative(ROOT, abs))
  .filter((rel) => !SKIP.some((re) => re.test(rel)) && !rel.endsWith(".css"))

const problems = []
for (const rel of targets) {
  const text = readFileSync(join(ROOT, rel), "utf8")
  const lines = text.split("\n")
  const lineOf = (index) => text.slice(0, index).split("\n").length
  const allowed = (line, id) => {
    const here = lines[line - 1] ?? ""
    const above = lines[line - 2] ?? ""
    return new RegExp(`design-allow:\\s*${id}\\b`).test(here + "\n" + above)
  }
  for (const rule of rules) {
    for (const m of text.matchAll(rule.re)) {
      const line = lineOf(m.index)
      if (!allowed(line, rule.id)) problems.push({ rel, line, id: rule.id, match: m[0], message: rule.message })
    }
  }
  for (const [index, match] of controlHeights(text)) {
    const line = lineOf(index)
    if (!allowed(line, "control-height"))
      problems.push({
        rel,
        line,
        id: "control-height",
        match,
        message: "Control height set by hand. Inputs, selects and lg/xl buttons follow --control-h; change density, not the control.",
      })
  }
}

if (problems.length) {
  for (const p of problems) console.log(`${p.rel}:${p.line}  ${p.id}  "${p.match}"\n    ${p.message}`)
  console.log(`\n${problems.length} design problem${problems.length === 1 ? "" : "s"}. See DESIGN.md.`)
  process.exit(1)
}
console.log(`Design check passed (${targets.length} files).`)
