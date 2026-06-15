const SOURCE_MARKERS = [
  "z-library",
  "zlib",
  "z-lib",
  "1lib",
  "libgen",
  "pdfdrive",
];

function basename(value: string) {
  return value.split(/[\\/]/).pop() ?? value;
}

function withoutPdfSuffix(value: string) {
  return value.replace(/\.pdf$/i, "");
}

function trimTrailingGroups(value: string) {
  let title = value.trim();
  while (true) {
    const trimmed = title.trimEnd();
    if (!trimmed.endsWith(")") && !trimmed.endsWith("）")) return title;
    let depth = 0;
    let openIndex = -1;
    for (let index = trimmed.length - 1; index >= 0; index -= 1) {
      const char = trimmed[index];
      if (char === ")" || char === "）") depth += 1;
      if (char === "(" || char === "（") {
        depth -= 1;
        if (depth === 0) {
          openIndex = index;
          break;
        }
      }
    }
    if (openIndex < 0) return title;
    title = trimmed.slice(0, openIndex).trim();
  }
}

function removeSourceMarkers(value: string) {
  const lower = value.toLowerCase();
  const firstMarker = SOURCE_MARKERS
    .map((marker) => lower.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return firstMarker === undefined
    ? value
    : value.slice(0, firstMarker).replace(/\s*[\(（]\s*$/u, "");
}

export function inferBookTitleFromPdfName(value: string) {
  const cleaned = withoutPdfSuffix(basename(value))
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimTrailingGroups(removeSourceMarkers(cleaned)).trim();
}
