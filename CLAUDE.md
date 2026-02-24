# Figma → Code Accuracy Rules

## Core Rule: Recreate, Never Redesign

Every screen must be an accurate code recreation of the Figma source — not an interpretation, not an improvement, not a guess. If it is not visible in the Figma design, it does not exist in the code.

---

## Mandatory Workflow for Every Screen

### Step 1 — Get the Figma source before writing a single line

1. Call `get_screenshot` on the exact node → study it carefully.
2. Call `get_design_context` on the same node → extract layout, tokens, text, icon paths.
3. Call `get_variable_defs` if token values are needed.

**Do not start writing HTML/CSS until steps 1–3 are complete.**

### Step 2 — Inventory every element exactly

From the screenshot and design context, list:
- Exact number of rows, cards, buttons — count them.
- Exact text strings — copy verbatim, do not paraphrase.
- Exact icons — use SVG paths from design context or trace from screenshot; never invent icons.
- Exact colors — from design tokens or get_variable_defs; never approximate.
- Exact spacing/sizing — from design context measurements.

### Step 3 — Write code matching the inventory

- If Figma shows 2 transaction rows → code has 2 rows, not 3.
- If Figma shows no icon in a cell → code has no icon in that cell.
- If Figma shows a specific SVG shape → reproduce that shape, not a "similar" one.
- If Figma shows plain text → code has plain text, no decorative additions.

### Step 4 — Verify against Figma after writing

1. Start dev server (preview_start).
2. Take screenshot (preview_screenshot).
3. Compare screenshot against the Figma get_screenshot result side by side.
4. List any discrepancies and fix them before presenting to the user.

---

## What Is Forbidden

| Forbidden | Instead |
|-----------|---------|
| Inventing icons not in Figma | Trace exact SVG from design context or get_screenshot |
| Adding rows/cards not in Figma | Count elements in Figma and match exactly |
| Approximating colors | Use exact hex from get_variable_defs or design context |
| Improving layout | Reproduce Figma layout exactly, even if it seems imperfect |
| Adding animations not in Figma | Only add if explicitly shown in Figma prototype connections |
| Guessing font weights | Read exact weight from design context |
| Creative placeholder content | Use exact text/data from Figma |

---

## Icon Rule (Strict)

Icons must come from one of these sources only:
1. SVG path data returned in `get_design_context`
2. Traced from `get_screenshot` pixel content
3. Explicitly identified as a standard SF Symbol by name in the design notes

Never create a "representative" icon from scratch. If the icon path is not available, place an empty placeholder and note it — do not substitute a different shape.

---

## Files

- `cashback-home.html` — Cashback platform home screen (GlxMr2W1ltdGgIBhK8eqf1, node 418-7107)
- `moments-prototype.html` — Rundi Moments P2P flow (5 screens)
- Dev server: `python3 -m http.server 8080` (configured in `.claude/launch.json`)
