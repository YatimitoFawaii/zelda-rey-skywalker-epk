#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const OUTPUT_PATH = new URL("../data/gigs.json", import.meta.url);
const MANUAL_GIGS_PATH = new URL("../data/manual-gigs.json", import.meta.url);
const CONFIG_PATH = new URL("../data/gig-config.json", import.meta.url);
const FEED_URL = process.env.GOOGLE_CALENDAR_ICS_URL || process.argv[2];
const DISPLAY_TIMEZONE = process.env.GIG_TIMEZONE || "America/Los_Angeles";

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const manualGigs = await readJsonIfPresent(MANUAL_GIGS_PATH, []);
const fromDate = process.env.GIG_FROM_DATE || todayInTimeZone(DISPLAY_TIMEZONE);

if (!FEED_URL) {
  await writeGigs(upcomingGigs(manualGigs, fromDate));
  console.log("No GOOGLE_CALENDAR_ICS_URL set; wrote manual gigs only.");
  process.exit(0);
}

const response = await fetch(FEED_URL);
if (!response.ok) {
  throw new Error(`Calendar feed returned ${response.status} ${response.statusText}`);
}

const ics = await response.text();
const allGigs = upcomingGigs(parseCalendar(ics, config), fromDate).sort((a, b) => {
  return a.date.localeCompare(b.date) || a.band.localeCompare(b.band);
});

await writeGigs(allGigs);
console.log(`Wrote ${allGigs.length} gigs to data/gigs.json.`);

async function readJsonIfPresent(url, fallback) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeGigs(gigs) {
  const sorted = upcomingGigs(dedupeGigs(gigs), fromDate).sort((a, b) => {
    return a.date.localeCompare(b.date) || a.band.localeCompare(b.band);
  });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
}

function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function upcomingGigs(gigs, fromIsoDate) {
  return gigs.filter((gig) => gig.date >= fromIsoDate);
}

function parseCalendar(icsText, gigConfig) {
  const lines = unfoldLines(icsText);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) events.push(current);
      current = null;
      continue;
    }

    if (!current) continue;

    const property = parseProperty(line);
    if (!property) continue;

    if (!current[property.name]) current[property.name] = [];
    current[property.name].push(property);
  }

  return events
    .map((event) => eventToGig(event, gigConfig))
    .filter(Boolean);
}

function unfoldLines(icsText) {
  const rawLines = icsText.replace(/\r\n/g, "\n").split("\n");
  const lines = [];

  for (const line of rawLines) {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line.trimEnd());
    }
  }

  return lines;
}

function parseProperty(line) {
  const separator = line.indexOf(":");
  if (separator === -1) return null;

  const left = line.slice(0, separator);
  const value = unescapeIcs(line.slice(separator + 1));
  const [rawName, ...rawParams] = left.split(";");
  const params = {};

  for (const rawParam of rawParams) {
    const [key, ...valueParts] = rawParam.split("=");
    if (!key) continue;
    params[key.toUpperCase()] = valueParts.join("=");
  }

  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
}

function unescapeIcs(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function eventToGig(event, gigConfig) {
  const summary = event.SUMMARY?.[0]?.value ?? "";
  if (!isGig(summary, gigConfig.gigPrefix)) return null;

  const location = event.LOCATION?.[0]?.value ?? "";
  const description = event.DESCRIPTION?.[0]?.value ?? "";
  const eventText = `${summary}\n${location}\n${description}`;
  if (isExcluded(eventText, gigConfig)) return null;

  const band = detectBand(summary, gigConfig);
  if (!band) return null;

  const start = event.DTSTART?.[0];
  const date = start ? dateFromIcs(start.value, start.params) : "";
  if (!date) return null;

  const { venue, city } = parseLocation(location);
  const ticketUrl = specialTicketUrl(eventText, gigConfig);

  return compactObject({
    band,
    date,
    venue,
    city,
    ticketUrl,
    source: "Google Calendar",
  });
}

function isGig(summary, gigPrefix) {
  return summary.trim().toLowerCase().startsWith(gigPrefix.toLowerCase());
}

function detectBand(summary, gigConfig) {
  const normalized = summary.toLowerCase();

  for (const band of gigConfig.bands) {
    const found = band.matches.some((match) => {
      const normalizedMatch = match.toLowerCase();
      if (normalizedMatch.length <= 4) {
        return new RegExp(`\\b${escapeRegExp(normalizedMatch)}\\b`, "i").test(normalized);
      }
      return normalized.includes(normalizedMatch);
    });

    if (found) return band.name;
  }

  return "";
}

function isExcluded(eventText, gigConfig) {
  return (gigConfig.excludeContains ?? []).some((needle) => {
    return eventText.toLowerCase().includes(needle.toLowerCase());
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dateFromIcs(rawValue, params = {}) {
  if (/^\d{8}$/.test(rawValue)) {
    return `${rawValue.slice(0, 4)}-${rawValue.slice(4, 6)}-${rawValue.slice(6, 8)}`;
  }

  const match = rawValue.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return "";

  const [, year, month, day, hour, minute, second, zulu] = match;
  if (!zulu && (params.TZID || params.VALUE !== "DATE-TIME")) {
    return `${year}-${month}-${day}`;
  }

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
  return formatDateInTimeZone(date, DISPLAY_TIMEZONE);
}

function formatDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseLocation(location) {
  if (!location) {
    return { venue: "Venue TBA", city: "City TBA" };
  }

  const parts = location
    .replace(/\s+/g, " ")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const venue = parts[0] || "Venue TBA";
  let city = "";

  for (let index = 1; index < parts.length; index += 1) {
    const stateMatch = parts[index].match(/\b([A-Z]{2})(?:\s+\d{5})?\b/);
    if (stateMatch && parts[index - 1]) {
      city = `${parts[index - 1]}, ${stateMatch[1]}`;
      break;
    }
  }

  if (!city && parts.length >= 2) {
    city = parts.slice(-2).join(", ");
  }

  return {
    venue,
    city: normalizeCity(city || "City TBA"),
  };
}

function normalizeCity(city) {
  return city.replace(/\bSimiValley\b/g, "Simi Valley");
}

function specialTicketUrl(eventText, gigConfig) {
  const normalized = eventText.toLowerCase();
  const match = gigConfig.specialLinks.find((link) => {
    return normalized.includes(link.contains.toLowerCase());
  });

  return match?.ticketUrl ?? "";
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== ""));
}

function dedupeGigs(gigs) {
  const seen = new Set();

  return gigs.filter((gig) => {
    const key = [gig.band, gig.date, gig.city].join("|").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
