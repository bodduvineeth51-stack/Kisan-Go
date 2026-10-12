# Kisan Go — UI design guide

The `screens/` folder has the approved design for every screen, as HTML
reference files (one per screen, 390 × 844 phone size). Match them exactly:
same layout, spacing, colours, fonts, corner rounding, shadows and icons.

The HTML files are a **visual reference only**. They use a special design-tool
format (`<x-dc>`, `{{holes}}`, `<sc-for>`, `<sc-if>`, `support.js`) that does
NOT belong in the app. Rebuild each screen as normal React + Tailwind
components. Never copy those tags or `support.js` into the app.

## Screens

| File | Screen | Notes |
|---|---|---|
| 1-login.html | Login | Language choice, +91 phone input, "Get code" |
| 2-home.html | Home | Earnings card, 3 shortcut tiles, Today's jobs, floating "+ Add" button. **No Start work button here.** |
| 3-work-timer.html | Work timer | Customer row, vehicle choice, ring timer, Stop / Start again, sessions list, "Finish & send bill" |
| 4-bill-sent.html | Bill sent | Success header, bill card, WhatsApp message preview |
| 5-customers.html | Customers | Search + voice button, filter pills (All / Owes money / Paid), list, floating "+ Add" |
| 6-customer-page.html | Customer page | **Start work button lives here, at the top.** Call / WhatsApp, Owes-you card, history |
| 7-money.html | Money | Today / This week / Season tabs, earned / collected / to collect, who owes the most |

## Fonts

Load from Google Fonts in `index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Noto+Sans+Telugu:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- Font stack everywhere: `'Plus Jakarta Sans', 'Noto Sans Telugu', sans-serif`
- Big numbers and headings: weight 800 with slightly tight letter-spacing (about -0.5px to -1.5px)
- Body text: weight 500–700. Line height 1.3.

## Colours

| Name | Hex | Used for |
|---|---|---|
| bg | #F2FAF4 | Page background (soft mint) |
| surface | #FFFFFF | Cards, bottom bar, inputs |
| ink | #0F2A1A | Main text |
| muted | #4B6355 | Secondary text |
| primary | #15803D | Main green: buttons, hero cards, active tab |
| primary-bright | #16A34A | Start work button, accents, "Go" in logo |
| mint-100 | #DCFCE7 | Light green chips, active nav pill, login header |
| mint-200 | #BBF7D0 | Avatars, decorative circles |
| mint-50 | #F0FDF4 | Very light green fills |
| circle-1 | #22C55E | Decorative circles on green cards (45% opacity) |
| circle-2 | #4ADE80 | Decorative circles (30% opacity) |
| lime | #BEF264 | Small accent circle inside buttons, logo ring |
| due | #C2410C | Money owed (text) |
| due-bg | #FFEDD5 | Money owed (chip background) |
| due-bar | #FDBA74 | Unpaid part of progress bars |
| amber-bg / amber | #FEF3C7 / #B45309 | "Got payment" tile, some avatars |
| blue-bg / blue | #E0F2FE / #0369A1 | "Send reminders" tile, some avatars |
| danger | #DC2626 | Stop button |
| border | #E2EDE5 | Unselected button borders |
| divider | #EEF5F0 | Lines between rows |

Add these to `tailwind.config.js` under `theme.extend.colors` so you can use
classes like `bg-primary`, `text-muted`, `bg-due-bg`.

Customer avatars cycle through these colour pairs (background / text):
#BBF7D0/#166534, #FEF3C7/#92400E, #E0F2FE/#075985, #FCE7F3/#9D174D, #EDE9FE/#5B21B6.

## Shape and depth

- Corner rounding: cards 18–26px, buttons 16–24px, small chips 8–12px,
  avatars 14px (rounded square, not circle).
- Card shadow: `0 4px 14px rgba(15,42,26,0.06)`. Cards have **no border**.
- Green button and hero card shadow: `0 10px 22px rgba(21,128,61,0.3)`.
- Floating bottom bar: white, 24px rounded, 12px away from the screen edges,
  shadow `0 6px 24px rgba(15,42,26,0.12)`. The active tab gets a #DCFCE7 pill.
- Floating "+ Add" button: 58px tall pill, primary green, lime circle with a
  plus inside, bottom-right, sits just above the bottom bar.

## Touch and readability rules

- Every tap target is at least 44px tall. Main action buttons are 58–80px.
- Main actions show English with Telugu beneath (e.g. "Start work /
  పని మొదలుపెట్టండి").
- Money amounts use Indian formatting: ₹4,583, ₹48,600, ₹2,35,000.
- Icons are simple line icons (stroke 2–2.4). The `lucide-react` package
  matches them well: Home, Users, Wallet, Menu, Search, Mic, Phone,
  MessageCircle, Play, Plus, ChevronLeft, ChevronRight, Check, Clock, Lock.
  Don't use emoji as icons.

## Behaviour shown in the design

- Timer: green ring fills as time passes. "LIVE" red badge while running.
  The big red Stop button becomes a dark "Start again" button after stopping.
- Customers filter pills and Money period tabs switch the list/numbers.
- Tapping a customer anywhere opens the Customer page.
