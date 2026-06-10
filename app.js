const gigList = document.querySelector("#gig-list");
const videoGrid = document.querySelector("#video-grid");
const year = document.querySelector("#year");

if (year) {
  year.textContent = new Date().getFullYear();
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function todayIsoDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

function formatGigDate(isoDate) {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function gigMarkup(gig) {
  const ticketLink = gig.ticketUrl
    ? `<a class="button button-secondary ticket-link" href="${escapeHtml(gig.ticketUrl)}" target="_blank" rel="noreferrer">Tickets</a>`
    : "";

  return `
    <article class="gig-card">
      <time class="gig-date" datetime="${escapeHtml(gig.date)}">${formatGigDate(gig.date)}</time>
      <div>
        <span class="gig-band">${escapeHtml(gig.band)}</span>
        <span class="gig-location">${escapeHtml(gig.venue)} · ${escapeHtml(gig.city)}</span>
      </div>
      ${ticketLink}
    </article>
  `;
}

async function renderGigs() {
  if (!gigList) return;

  try {
    const response = await fetch("data/gigs.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Gig data unavailable");

    const today = todayIsoDate();
    const gigs = (await response.json())
      .filter((gig) => gig.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    gigList.innerHTML = gigs.length
      ? gigs.map(gigMarkup).join("")
      : `<p class="fallback-note">No posted upcoming gigs right now.</p>`;
  } catch (error) {
    gigList.innerHTML = `<p class="fallback-note">Gig listings are temporarily unavailable.</p>`;
  }
}

function youtubeId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    const embedMatch = parsed.pathname.match(/\/embed\/([^/]+)/);
    return embedMatch?.[1] ?? "";
  } catch {
    return "";
  }
}

function videoMarkup(video) {
  const id = youtubeId(video.url);
  if (!id) return "";

  return `
    <article class="video-card">
      <iframe
        src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}"
        title="${escapeHtml(video.title)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
      <strong>${escapeHtml(video.title)}</strong>
    </article>
  `;
}

async function renderVideos() {
  if (!videoGrid) return;

  try {
    const response = await fetch("data/videos.json", { cache: "no-store" });
    if (!response.ok) return;

    const videos = await response.json();
    const markup = videos.map(videoMarkup).filter(Boolean).join("");
    if (markup) videoGrid.innerHTML = markup;
  } catch {
    // The default empty state is already in the HTML.
  }
}

renderGigs();
renderVideos();
