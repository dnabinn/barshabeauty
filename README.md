# Barsha Beauty Salon — Website

## Project Structure
```
/
├── index.html              ← Homepage
├── css/main.css            ← Shared stylesheet
├── js/main.js              ← Shared JS (lang toggle, nav, scroll reveal)
├── js/config.js            ← Runtime config (BACKEND_URL, STRIPE_PUBLIC_KEY)
├── images/                 ← Massage, services, salon photos
├── pages/
│   ├── servicos.html       ← Full services & pricing list
│   ├── reservar.html       ← 4-step booking flow (service → date/time → details → payment)
│   ├── sobre.html          ← About page
│   ├── contacto.html       ← Contact form + map + info
│   └── admin.html          ← Password-gated bookings dashboard
└── backend/
    ├── server.js            ← Express API (Stripe + Supabase + Resend email)
    ├── package.json
    ├── .env.example
    ├── supabase/schema.sql
    └── public/              ← Mirror of the static frontend, served by Express
```

## Design System
- Colors: `--black` #0A0A0A, `--gold` #C9A24C, `--cream` #FAF9F6, `--white` #FFFFFF
- Fonts: Cormorant Garamond (display) + Jost (body)
- Bilingual: PT/EN toggle via `data-pt` / `data-en` attributes on every element
- Lang preference stored in localStorage as `barsha-lang`

## Location
| | |
|---|---|
| Address | Rua Arco do Marquês de Alegrete, loja 4 D, 1100-034 Lisboa |
| Phone | +351 920 522 330 |
| Hours | Mon–Sat 10h–20h · Sun 11h–19h |

## Services
- 13 massage types (30/45/60 min pricing)
- Facial cleansing, eyebrow/waxing services, lashes, nails, hair (African work)
- All prices include VAT
- Three services (Classic/Volume/Mega Volume Lashes, African hair work) are marked "Consultar / Ask us" because no fixed price was provided — edit `pages/servicos.html` and `pages/reservar.html` once you have pricing.

## Running the Backend

```bash
cd backend
npm install
cp .env.example .env   # then fill in real keys
npm start               # serves API + static site on PORT (default 3000)
```

### Required services
1. **Supabase** — create a project, run `backend/supabase/schema.sql` in the SQL editor, then copy `SUPABASE_URL` and the **service_role** key into `.env`.
2. **Stripe** — get `STRIPE_SECRET_KEY` for `.env` and the matching **publishable** key for `js/config.js` (`STRIPE_PUBLIC_KEY`). Until that's set, the booking page's payment step shows a placeholder instead of the real card form.
3. **Resend** (or swap for SendGrid) — used for booking confirmation emails and the contact form. Without `RESEND_API_KEY` set, those emails are silently skipped (booking still completes).
4. **Admin password** — set `ADMIN_PASSWORD` in `.env`; this is the password typed into `pages/admin.html`.

### Deploy notes
- The frontend can be hosted as static files (e.g. on the same Hostinger/Netlify setup as the reference site) with `js/config.js` → `BACKEND_URL` pointing at wherever `backend/` is deployed (Node host, e.g. Render/Railway/Hostinger Node app).
- If frontend and backend share the same domain (as in `backend/public/`), leave `BACKEND_URL = ''`.
- No SMS — only email confirmations, per project scope.

## What's still a placeholder
- Logo and real salon photos beyond the ones already provided in `images/extra/` — swap in higher-res branded photography when available.
- Three "Consultar" priced services need real prices.
- Google Reviews on the homepage are example copy — replace with real reviews once available, or wire up the Google Places API.
