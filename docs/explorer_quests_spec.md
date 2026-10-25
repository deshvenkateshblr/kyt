# KYT Explorer Quests Specification & Implementation Roadmap

## 1. Overview & Product Vision

The **India Explorer Passport** (`visited.html`) turns travel into an engaging, gamified journey ("Been There, Done That!"). 

While traditional filters (by vibe, setting, region, food) are functional and utilitarian, **Explorer Quests** are aspirational bucket lists and cultural hit-lists. They transform 145 destinations into achievable, thematic chapters that inspire travellers to stamp cities and complete legendary trails across India.

### Core Design Rules
1. **Bite-Sized & Achievable**: Every quest contains **less than 15 cities** (sweet spot: 4 to 12 cities).
2. **Culturally Resonant**: Grounded in authentic Indian cultural geographies (e.g., *Sapta Moksha Puri*, *12 Jyotirlingas*, *UNESCO Wonders*, *Maratha Strongholds*) rather than arbitrary groupings.
3. **High Overall Coverage**: Over **94% (137 of 145 cities)** are naturally covered across quests, with an option to reach 100%.
4. **Client-Side & Offline-First**: Zero server overhead; runs completely on-device using existing `localStorage` and `KYT_CITIES`.

---

## 2. The Explorer Quests Catalog

### I. Sacred & Spiritual Quests

| Quest ID | Title | Count | City IDs (`data/cities.js`) |
|---|---|:---:|---|
| `jyotirlinga` | **The 12 Jyotirlingas** | 12 | `somnath`, `srisailam`, `ujjain`, `omkareshwar`, `kedarnath`, `bhimashankar`, `varanasi`, `nashik`, `deoghar`, `dwarka`, `rameswaram`, `aurangabad` |
| `maha-vishnu` | **The Maha Vishnu Shrines** | 11 | `tirupati`, `badrinath`, `puri`, `dwarka`, `thiruvananthapuram`, `vrindavan`, `mathura`, `ayodhya`, `tiruchirappalli`, `kancheepuram`, `guruvayur` *(alt: `pandharpur`)* |
| `sapta-puri` | **Sapta Moksha Kshetra** | 7 | `ayodhya`, `mathura`, `haridwar`, `varanasi`, `kancheepuram`, `ujjain`, `dwarka` |
| `sapta-nadi` | **Sapta Nadi Sacred River Ghats** | 7 | `varanasi` (Ganga), `mathura` (Yamuna), `nashik` (Godavari), `maheshwar` (Narmada), `tiruchirappalli` (Kaveri), `vijayawada` (Krishna), `guwahati` (Brahmaputra) |
| `char-dham` | **The Bada Char Dham** | 4 | `badrinath`, `puri`, `rameswaram`, `dwarka` |
| `kumbh-tirthas` | **The 4 Kumbh Mela Tirthas** | 4 | `prayagraj`, `haridwar`, `ujjain`, `nashik` |
| `shakti-peethas` | **Major Shakti Peethas & Devi Kshetras** | 10 | `guwahati`, `kolkata`, `varanasi`, `madurai`, `kancheepuram`, `mysore`, `vijayawada`, `deoghar`, `gaya`, `srisailam` |
| `buddhist-trail` | **The Buddhist Footsteps** | 7 | `bodh-gaya`, `sarnath`, `nalanda`, `rajgir`, `dharamshala`, `tawang`, `gangtok` |
| `sacred-ganga` | **Sacred Ganga & Himalayan Tirthas** | 8 | `haridwar`, `rishikesh`, `varanasi`, `prayagraj`, `kedarnath`, `badrinath`, `chopta`, `gaya` |
| `sikh-heritage` | **Sikh Sacred Takhts & Heritage** | 5 | `amritsar`, `patna`, `delhi`, `chandigarh`, `patiala` |

---

### II. Empires, Citadels & Heritage Quests

| Quest ID | Title | Count | City IDs (`data/cities.js`) |
|---|---|:---:|---|
| `unesco-top10` | **Top 10 UNESCO Wonders** | 10 | `agra`, `jaipur`, `hampi`, `khajuraho`, `aurangabad`, `konark`, `bodh-gaya`, `chittorgarh`, `goa`, `delhi` |
| `maratha-forts` | **Maratha Strongholds & Citadels** | 6 | `pune`, `mahabaleshwar`, `lonavala`, `aurangabad`, `matheran`, `thanjavur` |
| `royal-rajasthan` | **Forts & Palaces of Rajputana** | 8 | `jaipur`, `udaipur`, `jodhpur`, `jaisalmer`, `bikaner`, `chittorgarh`, `pushkar`, `mount-abu` |
| `dravidian-temples` | **Great Dravidian Temple Empires** | 11 | `madurai`, `thanjavur`, `hampi`, `belur`, `halebidu`, `badami`, `pattadakal`, `kancheepuram`, `mysore`, `tiruchirappalli`, `thrissur` |
| `mughal-nawabi` | **Mughal & Nawabi Splendour** | 6 | `delhi`, `agra`, `lucknow`, `hyderabad`, `bhopal`, `gwalior` |
| `central-heartland` | **Heartland of Central India** | 7 | `orchha`, `gwalior`, `khajuraho`, `bhopal`, `indore`, `maheshwar`, `ujjain` |
| `golden-triangle` | **The Classic Golden Triangle** | 3 | `delhi`, `agra`, `jaipur` |
| `toy-trains` | **Heritage Mountain Toy Trains** | 4 | `darjeeling`, `shimla`, `ooty`, `matheran` |

---

### III. Nature, Mountains, Coasts & Adventure

| Quest ID | Title | Count | City IDs (`data/cities.js`) |
|---|---|:---:|---|
| `himalayan-high` | **High Himalaya Passes & Valleys** | 10 | `leh`, `kargil`, `spiti-valley`, `manali`, `gulmarg`, `sonamarg`, `pahalgam`, `srinagar`, `auli`, `jammu` |
| `colonial-hills` | **Colonial Hill Stations & Tea Trails** | 12 | `shimla`, `darjeeling`, `ooty`, `munnar`, `kodaikanal`, `nainital`, `mussoorie`, `coorg`, `kalimpong`, `shillong`, `dalhousie`, `mirik` |
| `tropical-coasts` | **Tropical Coasts & Backwaters** | 11 | `goa`, `gokarna`, `alleppey`, `kumarakom`, `varkala`, `kovalam`, `kochi`, `udupi`, `pondicherry`, `digha`, `mandarmoni` |
| `northeast-frontiers` | **Northeast Living Frontiers** | 10 | `guwahati`, `shillong`, `cherrapunji`, `mawlynnong`, `tawang`, `ziro`, `majuli`, `kaziranga`, `gangtok`, `pelling` |
| `wild-safari` | **Wild India: Tiger & Jungle Trail** | 6 | `ranthambore`, `jim-corbett`, `kaziranga`, `sundarbans`, `wayanad`, `bhimashankar` |
| `emerald-islands` | **Emerald Islands & Ocean Frontiers** | 5 | `andaman-islands`, `havelock-island`, `neil-island`, `lakshadweep`, `kanyakumari` |
| `desert-trail` | **The Great Desert & White Salt Trail** | 4 | `jaisalmer`, `jodhpur`, `bikaner`, `kutch` |

---

### IV. Regional Heartlands & Optional Gap-Closers

| Quest ID | Title | Count | City IDs (`data/cities.js`) |
|---|---|:---:|---|
| `gujarat-heritage` | **Heritage of Gujarat** | 8 | `ahmedabad`, `kutch`, `vadodara`, `surat`, `rajkot`, `somnath`, `dwarka`, `gandhinagar` |
| `punjab-heartland` | **Punjab & Grand Trunk Heartland** | 5 | `amritsar`, `chandigarh`, `patiala`, `ludhiana`, `jalandhar` |
| `great-metros` | **The Great Metros of India** | 6 | `mumbai`, `delhi`, `bengaluru`, `kolkata`, `chennai`, `hyderabad` |
| `mh-bhakti` *(optional)* | **Bhakti Saints of Maharashtra** | 5 | `shirdi`, `pandharpur`, `nashik`, `pune`, `bhimashankar` |
| `chota-nagpur` *(optional)* | **Plateaus & Waterfalls of the East** | 5 | `ranchi`, `jamshedpur`, `dhanbad`, `raipur`, `bhilai` |

---

## 3. Implementation Approach in 4 Steps

### Step 1: Data Module (`data/quests.js`) (Completed)
* [x] Created `data/quests.js` defining `window.KYT_QUESTS` and `window.KYT_QUEST_STORE`:
  * Unique ID, title, subtitle, icon, category (`spiritual`, `heritage`, `nature`, `regional`), and array of verified `cityIds`.
  * Unit/node validation script confirming 100% of referenced city IDs resolve in `KYT_CITIES`.
  * Precached `data/quests.js` in `sw.js` and loaded in `visited.html`.

### Step 2: Quests Selection Sheet & Controls in `visited.html` (Completed)
* [x] Placed a `[Quests]` button directly next to Search and Filter controls in `visited.html`.
* [x] Quests selection modal dialog with clean single scrollbar (`#pq-body`), body scroll locking, and category pills: `All Pillars (28)`, `Spiritual (7)`, `Heritage (7)`, `Nature (7)`, `Regional (7)`.
* [x] "All Explorer Quests" selectable item at top of list.
* [x] Clean quest cards showing title, icon, destination counts, and progress badges only when completed (🏆) or partially visited.

### Step 3: Interactive Filter Engine, Explainer Bar & Exit (Completed)
* [x] Isolates destination grid to the selected quest.
* [x] Dedicated Quest Explainer Bar above the grid displaying quest icon, title, unabbreviated description, real-time completion badge, and updated results counter.
* [x] Seamlessly respects secondary toggles (`Visited Only`, `Unvisited Only`, `Sort`, and Search).
* [x] One-click `✕` exit button directly on the Explainer Bar returns to the full catalog.
* [x] Reviewed and refined all 28 quest icons against bundled Lucide library for cultural and geographical accuracy.

### Step 4: Passport Badges & Share Card Integration (Up Next)
* [ ] **Passport Hero Panel**:
  * Highlight "Completed Quests" badges alongside Bronze/Silver/Gold level.
* [ ] **Canvas Share Card (`passport-extras.js`)**:
  * Add celebratory quest completion stamps/insignias to the downloadable canvas passport card.
* [ ] **Service Worker Update**:
  * Bump cache version in `sw.js` to ensure seamless offline update.

