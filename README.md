# D5XX — Droga5 20th Anniversary

## Deploy in 5 minutes

### 1. Install dependencies
```bash
npm install
```

### 2. Set up Resend (free email API)
1. Go to [resend.com](https://resend.com) → sign up free
2. Create an API key
3. Verify your sending domain (or use `onboarding@resend.dev` for testing)

### 3. Configure environment variables
```bash
cp .env.local.example .env.local
```
Edit `.env.local`:
```
RESEND_API_KEY=re_your_key_here
RSVP_TO_EMAIL=you@droga5.com
RSVP_FROM_EMAIL=d5xx@droga5.com   # must be a verified Resend domain
```

### 4. Test locally
```bash
npm run dev
# open http://localhost:3000
```

### 5. Deploy to Vercel

**Option A — Vercel CLI (fastest)**
```bash
npm i -g vercel
vercel
# follow prompts, then add env vars:
vercel env add RESEND_API_KEY
vercel env add RSVP_TO_EMAIL
vercel env add RSVP_FROM_EMAIL
vercel --prod
```

**Option B — GitHub**
1. Push this folder to a new GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Add the 3 environment variables in the Vercel dashboard
4. Deploy

---

## RSVP submissions
Each submission sends two emails:
- **You** get a notification with all guest details
- **Guest** gets a confirmation with event info

## Customise
- Date/location: `app/page.tsx` → About section
- Email template: `app/api/rsvp/route.ts`
- Fonts/colors: CSS variables at the top of `app/page.tsx`
