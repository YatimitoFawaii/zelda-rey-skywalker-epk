# Zelda Rey Skywalker EPK

Static musician EPK for free hosting, with local image assets, a Netlify-ready contact form, project links, highlight-video placeholders, and an upcoming gigs list.

## Preview Locally

```sh
node scripts/dev-server.mjs
```

Then open `http://localhost:5173`.

## Free Hosting Recommendation

Use Netlify for this version because the contact form is already marked up for Netlify Forms.

1. Create a free Netlify site from this folder or from a GitHub repository.
2. In Netlify, enable form notifications for the `contact` form.
3. Send notifications to `zeldareyskywalker@gmail.com`.
4. Keep the hidden `subject` field as `--Zelda Website Inquiry--`.
5. Point the NFC redirect URL to the Netlify URL.

Cloudflare Pages or GitHub Pages are also fine for the static site, but they will need a separate form provider or mail link fallback.

## Updating Videos

After the refreshed YouTube uploads are ready, add them to `data/videos.json`:

```json
[
  {
    "title": "Basura live highlight",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID"
  }
]
```

The page uses YouTube's privacy-enhanced embed domain and will not show anything while the list is empty.

## Gig Calendar Sync

The public site reads `data/gigs.json`. The gig calendar currently used for this site is:

```text
1abe54d4856eb160c2fd50db5eb3222eced87f93220cda2cb0e510e900b28b6c@group.calendar.google.com
```

Google's public iCal feed for this calendar currently publishes events as `Busy`, without titles or locations. For automatic hosted sync, use the calendar's private "Secret address in iCal format" as a GitHub secret, or change the calendar's public sharing to allow event details.

Recommended event title format:

```text
(G) Basura - Venue Name
(G) Real Big Top - Fallout Fringe Festival
(G) RBT - Venue Name
```

Recommended location format:

```text
Venue Name, Street Address, City, ST ZIP
```

The sync script only includes events with the `(G)` prefix and only keeps Basura or Real Big Top/RBT matches. It writes band, date, venue, and city, with no time displayed.
Events containing `No Zelda` are excluded from the public EPK.

Set this GitHub repository secret:

```text
GOOGLE_CALENDAR_ICS_URL
```

Then run the `Sync gigs` workflow manually or let it run hourly. When `GOOGLE_CALENDAR_ICS_URL` is set, the private calendar feed becomes the source of truth for `data/gigs.json`. If the secret is not set, the script falls back to `data/manual-gigs.json`.

To run it locally:

```sh
GOOGLE_CALENDAR_ICS_URL="https://calendar.google.com/calendar/ical/..." node scripts/sync-gigs.mjs
```
