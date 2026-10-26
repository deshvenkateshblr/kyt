# Cloudflare Worker Setup for KYT Shortlinks

This tiny serverless script lets you share 55-character WhatsApp links (e.g. `https://vividnova.com/kyt/trip_detail.html?c=k7x9p2`) with 100% full itinerary fidelity.

---

### Step-by-Step 2-Minute Setup in Cloudflare Dashboard

1. **Log in to Cloudflare**:
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com).

2. **Create the KV Database**:
   - In the left sidebar, click **Storage & Databases** → **KV**.
   - Click **Create Namespace**.
   - Enter Namespace Name: `TRIP_KV`
   - Click **Add**.

3. **Create the Worker**:
   - In the left sidebar, click **Compute (Workers & Pages)** (or **Workers & Pages**).
   - Click the blue **Create application** button.
   - On the next screen, under the **Create Worker** section, click the **Get started** button (or click the **Hello World** card).
   - Name your worker `kyt-share` (or keep the default name).
   - Click the blue **Deploy** button at the bottom.

4. **Paste the Worker Code**:
   - On the worker page, click **Edit Code** (top right).
   - Delete the default code and paste the entire contents of [`worker.js`](worker.js).
   - Click **Deploy**.

5. **Bind the Database to the Worker**:
   - Go back to the Worker overview page.
   - Click the **Settings** tab.
   - Under **Variables and Secrets** (or **Bindings** depending on dashboard view), look for **KV Namespace Bindings**.
   - Click **Add binding**:
     - **Variable name**: `TRIP_KV` (must match exactly)
     - **KV namespace**: select `TRIP_KV` from the dropdown.
   - Click **Save and deploy**.

6. **Copy your Worker URL**:
   - At the top of your Worker page, you will see your public URL, e.g.:
     `https://kyt-share.<your-subdomain>.workers.dev`
   - Paste that URL into KYT's configuration in `js/config.js` or `trip_detail.html`!
