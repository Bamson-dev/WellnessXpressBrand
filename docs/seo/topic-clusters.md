# Topic clusters and content calendar

Built from Google autocomplete data for Nigeria and live search results collected on 23 November 2026 (see keywords.csv and competitors.csv). No search volumes were available from a free source, so priorities use demand signals (autocomplete), how weak the current Nigerian results are, and fit with the products.

Rules for every guide: sources recorded, claims match the sources, no product health claims, passes `scripts/content-check.mjs`.

## 1. Tummy and bloating (pillar: /guides/bloating-or-belly-fat, published)

Search intent: people want to know why their tummy looks bigger and what to do. Top results are US and UK hospitals; no Nigerian page ranks.

| Guide | Target keywords | Status | Priority |
|---|---|---|---|
| Bloating or belly fat? How to tell the difference | bloating vs belly fat, how to stop bloating, what causes bloating | Published | P1 |
| Bloating after eating: common causes and simple fixes | how to stop bloating after eating, bloating and gas | Planned | P2 |
| Flat tummy exercises you can do at home | flat tummy exercise at home | Planned (needs a fitness source such as NHS strength guides) | P2 |

## 2. Nigerian nutrition (pillar: /guides/healthy-eating-with-nigerian-food, published)

Search intent: practical meal ideas using local food. Nigerian results are winnable (insurer blog, food blogs).

| Guide | Target keywords | Status | Priority |
|---|---|---|---|
| Healthy eating with Nigerian food | nigerian food for weight loss, healthy nigerian food for weight loss | Published | P1 |
| 7-day Nigerian meal plan for weight management | nigerian meal plan for weight loss, meal timetable, affordable meal plan | Planned | P1 |
| Low-calorie Nigerian soups, swallows and snacks | low calorie nigerian foods, soups, swallow, snacks | Planned (needs a food composition source) | P1 |
| Healthy Nigerian breakfast ideas | healthy nigerian breakfast for weight loss | Planned | P2 |
| Eating at owambe and outside the home | eating out, party food | Planned | P3 |

## 3. Appetite and hunger

| Guide | Target keywords | Status | Priority |
|---|---|---|---|
| Why am I always hungry? Common reasons | why am i always hungry, even after eating, at night | Planned (high risk wording around pregnancy: needs reviewer) | P2 |
| Foods that keep you full longer | appetite suppressant foods | Planned | P2 |
| Appetite suppressants in Nigeria: what to check before you buy | appetite suppressant in nigeria, side effects, NAFDAC | Planned (high risk: needs reviewer; cite NAFDAC) | P2 |

## 4. Weight management basics (pillar planned)

| Guide | Target keywords | Status | Priority |
|---|---|---|---|
| How to lose weight in Nigeria: a realistic plan | how to lose weight in nigeria, as a nigerian | Planned pillar | P1 |
| How to check a supplement is NAFDAC registered | NAFDAC registration check | Planned (cite nafdac.gov.ng) | P2 |

## 5. Product education (blocked)

Ingredient and usage guides for Tummy Tea, Flat Tummy Seed, Appetite Suppressant, Metabolic Reset, Trim Down Coffee and Get Snatched Oil need verified label information (ingredients, directions, NAFDAC numbers if any). The product pages currently say to read the label and ask on WhatsApp. Nothing will be written until the owner supplies label photos or text.

## Internal linking rules

- Every guide links to its pillar and to at least one related guide.
- Product pages show "Helpful guides" (guides that list the product first, then general guides). Listing never implies a health effect.
- Guides only list products under `products:` when the guide genuinely discusses that product with verified facts.
- The footer links to /guides on every page. The seo-audit script flags orphan pages and broken links daily.
