# Quote & Invoice Engine — Requirements Specification

**Product:** toxicleanservices.com (admin / staff area)
**Status:** Ready for design and build · UI/UX in progress
**Version:** 2.1 (5 Oct 2026: VAT registration flag, optional stock clause, legal ids, presentation template)
**Source:** pricing logic, documents and decisions from the BTC / GDIZ job (Oct 2026). The final client quotation `TSL/BTC/2026/002 Rev. 2 – Programme Options` is the **reference template** for document output.

---

## 0. Summary

Staff must be able to generate a professional quotation (proforma) and invoices **on the fly** for **any type of job**: a flat, an office, a warehouse, a factory, farmland or an institution. The engine:

1. Takes a **site survey** (measured areas *or* a scope of deliverables).
2. Prices it from a **rate card** (per country/currency), with optional **client-specific overrides**.
3. Checks the price against an **internal cost sheet** and blocks loss-making quotes.
4. Optionally builds **programme options** (e.g. 1 / 3 / 4 / 6 months) with per-option payment terms.
5. Renders a **client-facing PDF** from a fixed template, never showing internal costs or resources.
6. After acceptance, issues **final and recurring invoices**, schedules visits and tracks visit reports.

### Agreed decisions (Oct 2026)

| Topic | Decision |
|---|---|
| Who creates quotes | **Staff only** for now (no customer self-quote on `/book`) |
| Payments | **Offline only** (bank transfer / Mobile Money); staff mark payments as received |
| Rate card editing | **Role-based** (RBAC) |
| Client-specific prices | **Yes, optional** overrides per client |
| Technician app | **Must work offline** (survey + visit reports), sync later |
| Legal mentions | **Yes**, per country (RC, IFU/TIN, VAT no.) on every document. Benin entity: **RC 2023686 · IFU 0202595972979** |
| VAT | Benin entity **not VAT-registered yet** (accountant, Oct 2026): documents show *"VAT (TVA) not applicable"* until switched on. When enabled, prices are **VAT-exclusive** (HT + TVA = TTC) |
| Insurance statement | **Not shown** (company flag off) |
| Stock-protection clause | **Optional per quote** (staff toggle); not used on the BTC quote |

---

## 1. Users & roles

| Role | Can do |
|---|---|
| **Admin** | Everything; edit rate cards, cost defaults, text templates, equipment registry, numbering; override margin guard |
| **Sales / Account manager** | Create and edit quotes, choose options, apply discounts up to a limit (configurable, e.g. 10%), send quotes, record acceptance |
| **Finance** | Issue invoices, record payments, manage tax settings, view margins |
| **Technician** | Offline site survey, visit reports, photos, client signature; **no prices visible** |
| **Client** (`/account/bookings`) | View quotes/invoices/reports, accept a quote (tick option + sign), download PDFs |

Margins, costs and the internal cost sheet are visible to **Admin and Finance only**.

---

## 2. Core concepts

| Concept | Meaning |
|---|---|
| **Site** | A client location, with optional **zones** (e.g. Developed area, Perimeter land, Office block) |
| **Survey** | What was observed or measured: rooms, zones, areas, pests, stock sensitivity, counts (stations, entry points) |
| **Pricing mode** | How the core intervention is priced: `MEASURED`, `SCOPE` or `HYBRID` (§4) |
| **Corrective intervention** | The first treatment, a priced bundle of lines. Same in every programme option |
| **Service visit** | A recurring attendance after the intervention, priced per visit |
| **Attendance** | Any time the team is on site. *Attendances = 1 (intervention) + service visits* |
| **Programme option** | A package = intervention + N service visits over M months |
| **Additional services** | Unit-priced extras outside the package (extra station, extra visit, extra day, call-out) |
| **Complimentary item** | A line shown with its **value** but charged at **0** (e.g. a preliminary inspection already done) |
| **Internal cost sheet** | Real costs (labour, chemicals, fuel, travel, lodging). **Never shown to the client** |
| **Rate snapshot** | Copy of all rates and costs used, stored on each quote revision |

---

## 3. Catalogue & rate card

### 3.1 Service catalogue (admin-managed)

Every billable item is a **catalogue item** with a pricing method, so new services need no code change.

```ts
type PricingMethod =
  | "PER_M2"        // area × rate (rooms, buildings)
  | "PER_HA"        // hectares × rate (large land)
  | "PER_UNIT"      // count × rate (bait stations, entry points)
  | "PER_VISIT"     // service visits
  | "PER_DAY"       // extra working days
  | "PER_MONTH"     // fixed monthly fee
  | "FIXED"         // one price (inspection, mobilisation)
  | "LUMP_SUM";     // "1 lot" priced job, client sees coverage text instead of qty

interface CatalogueItem {
  id: string;
  code: string;                 // e.g. "BAIT_STATION"
  name: { en: string; fr: string };
  clientDescription: { en: string; fr: string }; // what the client reads
  pricingMethod: PricingMethod;
  category: "INSPECTION" | "RODENT" | "SNAKE" | "INSECT" | "TERMITE" | "LAND" | "PROOFING" | "MOBILISATION" | "REPORTING" | "OTHER";
  pests: PestType[];            // which pests it addresses
  defaultCoverageText?: { en: string; fr: string }; // e.g. "Full perimeter"
  showUnitPrice: boolean;       // true only where a client-meaningful unit exists (e.g. station)
  active: boolean;
}
```

### 3.2 Rate card (per country, versioned)

All money in the country currency: **XOF (Benin)** or **NGN (Nigeria)**. Prices are **never hardcoded**.

| Key | Method | Example default (XOF)* | Notes |
|---|---|---|---|
| `roomEmptyPerM2` | PER_M2 | 500 | Empty room |
| `roomFurnishedPerM2` | PER_M2 | 800 | Must be > empty (≈1.5–2× effort) |
| `roomMinimumCharge` | FIXED | 10,000 | Applied when a room's m² price is lower |
| `largeAreaThresholdM2` | — | 100 | Tiering threshold |
| `largeAreaRatePerM2` | PER_M2 | 500 | Rate above threshold (or a % factor) |
| `landTreatmentPerHa` | PER_HA | to set | Land after clearing (snakes/rats) |
| `bushClearingPerHa` | PER_HA | to set | Optional; or per plot (~500 m²) |
| `entryPointSealing` | PER_UNIT | 5,000 | Holes, drains, gaps |
| `baitStation` | PER_UNIT | **22,500** | Supplied & installed |
| `inspectionValue` | FIXED | **350,000** | Preliminary inspection (can be complimentary) |
| `siteSurveyAndMap` | FIXED / LUMP_SUM | 200,000 + 50,000 | Day-1 detailed survey, endoscope, site map |
| `mobilisation` | FIXED | **300,000** | Equipment & logistics (per intervention) |
| `serviceVisit` | PER_VISIT | **350,000** | Recurring attendance |
| `extraWorkingDay` | PER_DAY | **450,000** | Additional on-site day, intervention team |
| `emergencyCallOut` | FIXED | **200,000** | Between scheduled visits (e.g. snake sighting) |
| `maintenanceVisit` | PER_VISIT | 350,000 | After programme end |
| `vatRate` | % | 18% (BJ) | Per country; applies **only if `company.vatRegistered = true`**; allow 0 / exempt per client |
| `depositRate` | % | 50% | Default; options can override (§6) |
| `upfrontDiscountRate` | % | 5–10% | Multi-month prepaid |
| `quoteValidityDays` | days | 14 | |

\*Bold values are the agreed BTC job rates. Others are placeholders that admin must confirm.

### 3.3 Client rate overrides

```ts
interface ClientRateOverride {
  clientId: string;
  key: string;          // rate-card key or catalogue code
  value: number;
  validFrom: string; validTo?: string;
  reason?: string;
}
```
Resolution order: **client override → country rate card**. A quote line that used an override is flagged in the editor (not on the client PDF).

---

## 4. Pricing modes (works for any project type)

### 4.1 `MEASURED`: area-based (rooms, flats, offices, small warehouses)

Use when areas can be measured reliably.

```ts
interface RoomInput {
  name: string;              // "Office 1", "Cloth store A"
  zoneId?: string;
  lengthM?: number; widthM?: number; areaM2?: number; // either L×W or area
  condition: "empty" | "furnished";
  containsStock?: boolean;   // textiles/food/goods → safety rules (§9)
  stockType?: "textile" | "food" | "pharma" | "electronics" | "other";
}
```
Rules:
```
area        = areaM2 ?? round2(lengthM × widthM)    // L-shaped rooms = two entries
baseRate    = furnished ? roomFurnishedPerM2 : roomEmptyPerM2
tiered      = area ≤ T ? area×baseRate : T×baseRate + (area−T)×largeAreaRatePerM2
roomAmount  = max(roomMinimumCharge, tiered)
```

### 4.2 `SCOPE`: deliverable-based (large factories, sites not fully measured)

Use when the site is large or areas are **not verified** (the BTC case). The intervention is a list of deliverable lines; the client sees **coverage text** instead of quantities of internal resources.

Reference: BTC corrective intervention (XOF):

| Line | Client description | Quantity / coverage | Amount |
|---|---|---|---|
| A1 | Detailed site survey and endoscopic inspection of concealed areas | Full site | 200,000 |
| A2 | Site map with all bait stations numbered | 1 map | 50,000 |
| A3 | Rehabilitation of existing bait stations | All existing stations | 200,000 |
| A4 | New lockable bait stations, supplied and installed (22,500 each) | 20 stations | 450,000 |
| A5 | Initial baiting of all stations with professional rodenticide | All stations | 250,000 |
| A6 | Perimeter treatment: fence line, building edges, burrows, entry points | Full perimeter | 500,000 |
| A7 | Snake-risk deterrent fogging, from buildings outward | Bush and vegetation edges | 150,000 |
| A8 | Insect-control fogging | Drains and non-stock areas | 50,000 |
| A9 | Mobilisation of equipment and logistics | 1 | 300,000 |
| A10 | Intervention report and treatment certificate | 1 each | Included |
| | **Subtotal** | | **2,150,000** |

Rules:
- In `SCOPE` mode, **site area is optional and is never printed unless `areaVerified = true`**.
- The engine **auto-inserts the scope clause** (§9.3): pricing based on defined scope, with extras at unit rates.
- Capped quantities (e.g. "up to 20 stations") must be stored as a cap, and the matching **additional-service unit rate** must exist.

### 4.3 `HYBRID`

Measured rooms (§4.1) plus scope lines (§4.2) plus land (§4.4) in one quote, e.g. an office block measured by room plus a perimeter priced by coverage.

### 4.4 Land & zones

```ts
interface ZoneInput {
  name: string;                     // "Developed area", "Perimeter / bush land"
  type: "DEVELOPED" | "UNDEVELOPED" | "BUILDING" | "PERIMETER";
  areaM2?: number; areaHa?: number;
  areaVerified: boolean;            // false → never printed (§9.3)
  weight?: number;                  // internal analysis only (default developed 3 : undeveloped 1)
  bushClearing?: { include: boolean; byClient: boolean };
}
```
- Land is priced **per hectare** (per-m² rates on large land produce unrealistic totals).
- Default advice: treat a **buffer zone** around buildings, not the whole land.
- If `bushClearing.byClient = true`, insert the client-responsibility block (§9.2).

### 4.5 Per-m² analysis (internal only)

For any priced quote, the engine can show **equivalent rates** (Admin/Finance only): all-in price per m² and per hectare over the programme, and zone-weighted rates (developed vs undeveloped), excluding per-unit and fixed items. **These are never printed on client documents.**

```
weightedArea      = Σ(zoneArea × weight)
areaPool          = interventionTotal − perUnitItems − fixedItems
ratePerWeightedM2 = areaPool / weightedArea
zoneRate          = ratePerWeightedM2 × zone.weight
```

---

## 5. Programme options (packages)

### 5.1 Formula

```
optionTotal  = interventionSubtotal + serviceVisits × serviceVisit
attendances  = 1 + serviceVisits
avgPerMonth  = months > 1 ? optionTotal / months : null
```
Default visit pattern: **2 attendances per month**. Month 1 = intervention + 1 follow-up (week 3); each following month = 2 visits.

Default option set (configurable per quote):

| Option | Months | Service visits | Attendances | BTC total (XOF) | Avg / month |
|---|---|---|---|---|---|
| 1 – Corrective Intervention | 1 | 1 | 2 | 2,500,000 | — |
| 2 – Stabilisation | 3 | 5 | 6 | 3,900,000 | 1,300,000 |
| 3 – Extended Control | 4 | 7 | 8 | 4,600,000 | 1,150,000 |
| 4 – Intensive Integrated ★ | 6 | 11 | 12 | 6,000,000 | 1,000,000 |

### 5.2 Rules
- **Cumulative contents:** each option = everything in the previous option + more. The editor generates "Everything in Option N, plus …".
- **Recommended flag:** exactly one option may be `recommended` (highlighted + recommendation box).
- **Price ladder check:** average per month must **decrease** with longer options (warning if not).
- **Short option disclaimer:** an option with no recurring monitoring (Option 1) automatically gets: *"Baseline correction only; lasting control requires scheduled monitoring."*
- **No option may be priced below cost** (margin guard, §7.3). Cheap options must **remove visits/scope**, not just reduce price.
- The client PDF shows **package price + attendances included**. "Average per month" is allowed; "cost per visit" is **not shown** (it confused readers).
- All scheduled attendances are stated as **included in the price**.

### 5.3 Single-price quotes
A quote can have **one** option only (classic quote), or no programme (one-off job, e.g. flat fumigation).

---

## 6. Payment terms

```ts
interface PaymentMilestone {
  label: { en: string; fr: string };
  percent: number;                          // sum per option = 100
  trigger: "ON_ACCEPTANCE" | "START_OF_MONTH" | "ON_COMPLETION" | "MONTHLY";
  month?: number;                           // for START_OF_MONTH
}
```
Default templates (per option):

| Option | Schedule |
|---|---|
| 1 month | 100% on acceptance |
| 3 months | 60% on acceptance · 40% start of Month 2 |
| 4 months | 50% on acceptance · 25% start of Month 2 · 25% start of Month 3 |
| 6 months | 50% on acceptance · 25% start of Month 3 · 25% start of Month 6 |

Rules:
- Percentages per option must total 100% (validation error otherwise).
- **Warning** if the on-acceptance amount is below the intervention cost (so we never pre-finance a job).
- Invoices payable within 7 days (configurable); overdue → services may be suspended (standard clause).
- Payments are **offline**: Finance records amount, date, method (bank / Mobile Money / cash), reference.

---

## 7. Internal cost sheet & margin guard (never client-facing)

### 7.1 Cost groups
Every cost is assigned to the group that drives it:

| Group | Driven by | Examples | Becomes |
|---|---|---|---|
| **AREA** | m² / ha treated | perimeter chemical, workmanship, equipment fuel | per-m² / per-ha / lump lines |
| **PER_UNIT** | count | bait stations, bait per station | per-unit lines |
| **MOBILISATION** | distance & days | vehicle fuel, travel, accommodation, feeding | fixed mobilisation line |
| **PER_VISIT** | number of visits | bait refills, travel per visit, team time | service-visit rate |

Plus `contingencyRate` (default 10%) and `targetMargin`.

```ts
interface CostLine {
  group: "AREA" | "PER_UNIT" | "MOBILISATION" | "PER_VISIT";
  label: string;                 // "Perimeter chemical (bottles)", "Accommodation"
  qty: number; unit: string;     // 72 bottles, 18 person-nights, 140 L
  unitCost: number;
  currency: "NGN" | "XOF";       // costs may be in NGN for an XOF quote
}
interface CostSheet {
  lines: CostLine[];
  fx: { from: "NGN"; to: "XOF"; rate: number; date: string }; // e.g. 0.4314 on 2026-10-05
  teamBase: "LOCAL" | "CROSS_BORDER"; // affects per-visit travel cost
  contingencyRate: number;
}
```

### 7.2 Outputs
- Total cost per group (converted to quote currency at the stored FX rate)
- Cost of intervention, cost per service visit, cost per option
- **Margin per line, per option and overall:** `margin% = (price − cost) / price`
- Suggested rates: `rate = cost / units × (1 + targetMargin)`

### 7.3 Margin guard
| Condition | Behaviour |
|---|---|
| Option or quote margin < 0 | **Block sending**; Admin override with reason (logged) |
| Margin < 20% (configurable) | Warning banner |
| Service-visit margin < 0 when `teamBase = CROSS_BORDER` | Specific warning ("visits from Lagos may lose money") |
| Unpriced cost lines (qty set, unitCost empty) | Warning: "cost sheet incomplete" |

### 7.4 BTC reference cost sheet (for testing)
Known costs (NGN): chemical 72 × 15,000 = 1,080,000 · rat poison 32,000 · bait food 100,000 · 20 stations × 16,000 = 320,000 · workmanship 6 × 100,000 = 600,000 · **known total ₦2,132,000 ≈ 920,000 XOF** at 0.4314. Unpriced: equipment fuel (80 L diesel, 50 L petrol, 10 L oil), vehicle fuel/travel, accommodation and feeding.

---

## 8. Client-facing rendering rules (critical)

The PDF and client portal must **never** show:
- team size, number of technicians, number of days, man-days
- labour rates, accommodation, feeding, fuel litres, chemical quantities/bottles
- costs, margins, FX rates, contingency, client-override flags
- site area when `areaVerified = false`
- "cost per visit"

Implementation: every field is tagged `visibility: "client" | "internal"`. The renderer receives a **client view model** built only from `client` fields. **Automated test:** rendered PDF text must not contain internal keywords (`man-day`, `accommodation`, `bottle`, `team of`, `margin`, …).

Client lines show: description, **Quantity / coverage** (plain words, e.g. "Full perimeter", "20 stations"), amount, and a unit price **only** where `showUnitPrice = true`.

---

## 9. Conditional text blocks (auto-inserted, editable templates EN/FR)

### 9.1 Triggers

| Trigger | Block inserted |
|---|---|
| Any rodents in scope | Bait only in locked, tamper-resistant stations; "do not move stations" responsibility |
| Snakes in scope | Snake-risk management scope; **"cannot guarantee zero sightings"**; emergency call-out rate; vegetation responsibility |
| Any room/zone `containsStock` **and** staff toggle `includeStockClause = true` | "No fogging or spraying over stock, finished goods or production materials"; thermal fogging not inside buildings with that stock. *(Toggle is per quote; the editor shows a warning when stock is present and the clause is off.)* Stock-on-pallets advice stays in client responsibilities |
| `stockType = textile` | Same as above (if toggled on), with textile wording |
| Land/bush in scope, cleared by client | Cleared zone ≥ {N} m around buildings (default 10 m), keep grass short, remove debris |
| Fogging lines present | Re-entry times communicated before treatment |
| `SCOPE` mode or unverified area | Scope clause (§9.3) |
| Programme option without monitoring | Baseline-only disclaimer (§5.2) |
| Complimentary line present | "Carried out at no cost to {client} and offered as part of this proposal." |
| `company.insuranceConfirmed = true` | Insurance statement (**off by default**; currently off) |

### 9.2 Standard client responsibilities
Vegetation · waste & debris · housekeeping & storage · bait stations untouched · prompt reporting & access · structural repairs/proofing excluded unless agreed in writing.

### 9.3 Scope clause
> "Pricing is based on the scope defined in this quotation (number of bait stations, working days and attendances) for the areas observed during the inspection of {inspectionDate}. A full site survey and site map are completed during the corrective intervention; additional bait stations, working days, visits or areas requested by {client} will be quoted at the unit rates in the Additional Services table."

### 9.4 Wording rules
- Never promise "total eradication". Use measurable results ("rats cleared = no activity on 2–3 consecutive visits").
- Describe fogging as **insect control** and **perimeter deterrent**, never as rat or snake elimination.

---

## 10. Pest → method validation (editor warnings)

| Pest | Valid primary methods | Warn if |
|---|---|---|
| Rats / mice | Bait stations, traps, proofing/sealing | Fogging is the only rodent method |
| Snakes | Habitat management (client), rodent reduction, perimeter deterrent, response to sightings | No vegetation responsibility / no disclaimer |
| Mosquitoes / flies | Thermal fogging (outdoor), ULV (indoor non-stock) | Thermal fogging inside stock areas |
| Cockroaches / ants | Gel bait, residual spray, ULV | — |
| Termites | Soil / wood treatment | — |
| Bed bugs | Targeted treatment | — |

Equipment shown on documents comes from an **equipment registry** (`name`, `type`, `applicationText`, `owned: boolean`). Only `owned = true` items can be listed.

---

## 11. Document template (from Rev. 2)

### 11.1 Types & numbering
- Types: `QUOTATION` (proforma, may contain options) → `INVOICE` (deposit / milestone / final / recurring) → `CREDIT_NOTE`.
- Quote number: `TSL/{CLIENTCODE}/{YYYY}/{seq}`, with **revisions** `Rev. 1, Rev. 2…`. A new revision supersedes the previous one; old revisions stay read-only.
- Invoice number: `TXC-{CC}-{YYYY}-{seq}` (sequence per country per year, no gaps).
- Dates: issue date; **valid until** = issue + `quoteValidityDays`.

### 11.2 Quotation sections (in order)
1. **Header:** logo; document type, number + revision, date, validity; "Delivering Excellent Solutions"; **both offices** (Lagos +234 · Agbo +229), company email (toxicleanservicesltd@gmail.com), website, **RC and TIN/IFU** (block send if empty)
2. **Title** (programme name) + client / project box (client, address, **client contact email**; inspection date; site name; coverage zones; options offered; area only if verified)
3. **Project background & rationale** (template + free text from survey findings)
4. **Scope of services** table (component → scope text), from selected catalogue categories
5. **Deliverables** (site map, treatment certificate, monthly report, end-of-programme review), filtered by option
6. **Equipment & technology** (registry, owned only, with corrected application text)
7. **Programme options** table: option, duration, attendances ("12: corrective intervention + 11 service visits"), cumulative contents; recommended row highlighted
8. **Commercial proposal**
   - 6.1 Complimentary items (value · "Complimentary" · 0)
   - 6.2 Corrective intervention breakdown (No. · Service · Quantity/coverage · Amount · subtotal)
   - 6.3 Programme prices (intervention · service visits · **total excl. taxes** · avg/month)
   - Tax note ("exclude applicable taxes (VAT/TVA) … according to client's tax status")
   - Recommendation box
   - 6.4 Additional services (unit rates)
9. **Payment terms** per option
10. **Client responsibilities** (conditional, §9)
11. **Liability & safety** (conditional, §9)
12. **Terms & conditions** (validity, scope clause, disclaimers, overdue suspension, extras in writing)
13. **Attachment** (Technical Presentation), optional. The presentation is generated from the **equipment registry** (owned items only): cover (quote ref + revision, both offices, RC/IFU), capability overview, gallery, method (Inspect → Target → Control → Monitor → Report), one page per equipment item with spec table and "client relevance" note, inspection technology, rodent & snake system, contact block
14. **Acceptance:** tick-box per option (with price), signature blocks for both parties (name, designation, signature/stamp, date)

Footer on every page: company · tagline · document number/revision · page X of Y.

### 11.3 Invoice layout
Header (as above) · bill-to · reference to accepted quote + option · milestone description · lines · subtotal · discount · **HT** · VAT/TVA · **TTC** · amount due · payment details (bank / Mobile Money) · due date · legal mentions.

### 11.4 Format
- A4 PDF, brand colours (red #E31E24), readable in black and white.
- **EN / FR** per document (default FR for Benin clients).
- Currency label: `FCFA` (XOF, no decimals) or `₦` (NGN). Amounts rounded to whole units **per line**; totals = sum of rounded lines.
- Share: download, email, **WhatsApp share**, client portal link.

---

## 12. Taxes

- `company.vatRegistered` per country entity. **If false: no VAT line anywhere; print "VAT (TVA) not applicable"** (current state for Benin, Oct 2026).
- If true: `vatRate` per country (Benin TVA 18%; Nigeria per current law); prices are **VAT-exclusive** and documents show HT, VAT and TTC (quotes may show a VAT column per option).
- Client flag `taxStatus: "STANDARD" | "EXEMPT" | "SPECIAL_ZONE"` (e.g. GDIZ). Exempt/special → VAT 0 with mention.
- Quotes may display **"excl. taxes"** totals only; invoices compute HT → VAT → TTC.
- Order of operations: `subtotal → discount → netHT → VAT → TTC`.

---

## 13. Service plan, visits & recurring invoices

- On acceptance of an option, the engine creates a **service plan**: intervention date, visit schedule (2/month default), payment milestones, and invoice drafts per milestone.
- **Visit report** (technician, offline): date, technician, stations checked/refilled/replaced (per numbered station: bait consumption none/low/medium/high), activity per area (Y/N), new entry points sealed, land condition (grass short Y/N), snake signs (Y/N), client responsibilities kept (Y/N), photos, client signature.
- `consecutiveNoActivity` counter drives the transition: after 2–3 clear visits → propose **maintenance** (every 2 months). If activity returns or in the rainy season → revert to monthly.
- **Monthly consolidated report** generated from that month's visit reports (PDF, client portal).
- End of programme → **review report + maintenance proposal** (pre-filled new quote).
- Free callbacks inside a plan are logged with no charge. Emergency call-outs outside scope create an extra invoice line at `emergencyCallOut`.

---

## 14. Workflow & statuses

```
Booking request (/book) → Survey (draft, offline-capable) → Quote draft
→ Internal review (margin guard) → Sent → [Revised (Rev. n)] → Accepted (option chosen, signed)
→ Deposit invoice → Deposit paid → Intervention done (certificate) → Service plan running
→ Milestone/recurring invoices → Completed → Paid / Closed
```
Quote statuses: `DRAFT · IN_REVIEW · SENT · REVISED · ACCEPTED · DECLINED · EXPIRED`.
Invoice statuses: `DRAFT · ISSUED · PARTIALLY_PAID · PAID · OVERDUE · CANCELLED`.
Every status change is audit-logged (who, when, what changed).

---

## 15. Data model (minimum)

`Company` (offices, legal ids, bank details, insuranceConfirmed) · `Country` (currency, vatRate, legal mentions) · `RateCard` (versioned) · `CatalogueItem` · `ClientRateOverride` · `Client` (taxStatus, language) · `Site` · `Zone` · `Survey` (rooms, zones, pests, stock flags, counts, photos) · `CostSheet` + `CostLine` (internal) · `Quote` (number, revision, mode, rate snapshot, cost snapshot, status) · `QuoteLine` (catalogueItemId, qty, coverageText, unitPrice, amount, visibility, complimentary, cap) · `ProgrammeOption` (months, serviceVisits, total, recommended, paymentMilestones[]) · `AdditionalServiceRate` · `TextBlock` (key, EN/FR, conditions) · `EquipmentItem` · `Invoice` + `InvoiceLine` · `Payment` · `ServicePlan` · `Visit` · `VisitReport` · `StationRecord` · `AuditLog`.

---

## 16. Screens (for UI/UX)

1. **Rate card** (per country, versioned, RBAC) + **client overrides**
2. **Catalogue & text templates** (EN/FR) + **equipment registry**
3. **Survey** (mobile, offline): site, zones, rooms (L×W or area, empty/furnished, stock), pests, counts, photos
4. **Quote builder**: choose mode (measured / scope / hybrid) → lines auto-filled from survey + catalogue → coverage texts → options builder → payment terms → complimentary items → live totals
5. **Internal panel** (Admin/Finance): cost sheet, FX, margins per line/option, guard warnings, per-m² analysis
6. **Preview** (exact client PDF) → send (email / WhatsApp / portal)
7. **Acceptance capture** (portal or upload of signed PDF)
8. **Invoices & payments**
9. **Service plan calendar**, visit reports, monthly reports
10. **Client portal** (`/account/bookings`)

---

## 17. Acceptance tests (must pass)

| # | Case | Expected |
|---|---|---|
| T1 | BTC scope lines A1–A10 | Subtotal **2,150,000 XOF**; A10 "Included" |
| T2 | BTC options at 350,000/visit | **2,500,000 / 3,900,000 / 4,600,000 / 6,000,000**; attendances 2 / 6 / 8 / 12; avg/month — / 1,300,000 / 1,150,000 / 1,000,000 |
| T3 | Rooms: 5×4 m furnished @800 + 6×5 m empty @500 + inspection 25,000 | 16,000 + 15,000 + 25,000 = **56,000**; VAT 18% = 10,080; TTC **66,080** |
| T4 | Minimum charge: 4 m² empty @500, min 10,000 | **10,000** |
| T5 | Tiering: 500 m² furnished, threshold 100 @800, above @500 | 80,000 + 200,000 = **280,000** |
| T6 | Complimentary inspection value 350,000 | Shown "350,000 · Complimentary · 0"; excluded from totals |
| T7 | Client tax status EXEMPT (company VAT-registered) | VAT 0, exemption mention printed |
| T7b | `company.vatRegistered = false` | No VAT column/line anywhere; "VAT (TVA) not applicable" printed; BTC totals 2.5M / 3.9M / 4.6M / 6.0M |
| T7c | `vatRegistered = true`, 18% | BTC totals incl. VAT 2,950,000 / 4,602,000 / 5,428,000 / 7,080,000 |
| T8 | Option priced below cost sheet | Send **blocked**; Admin override logged |
| T9 | Payment milestones sum ≠ 100% | Validation error |
| T10 | Rendered PDF text | Contains **none** of the internal keywords (§8); no area printed when unverified |
| T11 | Stock = textile + thermal fogging line indoors | Editor warning; textile safety clause present |
| T12 | Snakes in scope | "Cannot guarantee zero sightings" clause + call-out rate present |
| T13 | Rate card changed after sending | Sent quote totals unchanged (snapshot) |
| T14 | XOF rounding | Whole units per line; total = Σ rounded lines |
| T15 | FX: ₦2,132,000 at 0.4314 | ≈ **919,745 XOF** in internal panel |

---

## 18. Out of scope (for now) & open items

- Customer self-quote / instant estimate on `/book` (later; show as **estimate** if added)
- Online payment gateway
- To confirm: VAT rates and legal mentions per country (accountant); per-option payment templates as defaults; who may override the margin guard; default cleared-zone distance (10 m).

---

## Appendix A: Reference documents (BTC job)

- `Toxiclean_BTC_Quotation_TSL-BTC-2026-002_Rev2_Programme_Options.pdf`: **output template**
- `Toxiclean_BTEX_Invoice.xlsx`: room-based calculator (measured mode, T3–T5)
- `BTC_Price_per_m2_Breakdown.xlsx`: zone-weighted per-m² analysis (§4.5)
- `Toxiclean_Pricing_Guide.pdf`: how rates are derived from costs (§7)
- `BTEX_Job_Checklist.pdf`: operational checklist (survey, safety, visits)
