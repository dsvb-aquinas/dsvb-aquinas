// Finds the right evidence for each kind of question. Used online and offline.
const STOP = new Set("the a an and or of to in is was were be been it that this with as for on by at from but not he she his her they them i you we my me our your what who why how did does do which when where about would could should are has have had its than then so if".split(" "));
export const norm = t => t.toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
export const toks = t => norm(t).split(" ").filter(w => w && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ""));
const cap = s => s[0].toUpperCase() + s.slice(1).toLowerCase();
const first = (t, n) => t.split(" ").slice(0, n).join(" ");
function lead(t, n) { const w = t.split(" "); if (w.length <= n) return t; const s = w.slice(0, n).join(" "); const i = Math.max(s.lastIndexOf(". "), s.lastIndexOf("! "), s.lastIndexOf("? ")); return i > s.length * .5 ? s.slice(0, i + 1) : s + "…" }

function make(text, size, step, lab) {
  const w = text.split(" "), L = [], chunks = []; let cur = "Opening";
  const strict = (text.match(/\b(?:LETTER|CHAPTER) \d+\b/g) || []).length >= 3;   // book has real chapter headings: ignore words like "Act I" in prose
  const head = strict ? /^(LETTER|CHAPTER|Letter|Chapter)$/ : /^(LETTER|CHAPTER|PART|BOOK|ACT|SCENE|VOLUME|Letter|Chapter|Part|Book|Act|Scene|Volume)$/;
  for (let i = 0; i < w.length; i++) {
    if (lab && head.test(w[i]) && /^(\d+|[IVXL]+)\.?$/i.test(w[i + 1] || "")) cur = cap(w[i]) + " " + w[i + 1].replace(".", "");
    else if (lab && /^(AFTERWORD|PREFACE|INTRODUCTION)$/.test(w[i])) cur = cap(w[i]);   // running heads
    L[i] = cur }
  for (let i = 0; i < w.length; i += step) chunks.push(mk(w.slice(i, i + size).join(" "), lab ? L[i] : "Notes"));
  return { chunks, L }
}
const mk = (text, label) => { const t = toks(text); return { text, label, t, tf: t.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {}) } };
function stats(chunks) { const df = {}; chunks.forEach(c => Object.keys(c.tf).forEach(k => df[k] = (df[k] || 0) + 1)); return { chunks, df, avg: chunks.reduce((s, c) => s + c.t.length, 0) / Math.max(1, chunks.length) } }

// Split the study notes into one section per chapter/letter ("Chapter 5 (plain English) ...")
function sections(t) {
  const re = /\b((?:Letter|Chapter|Part|Book|Act|Scene|Volume)\s+(?:\d+|[IVXL]+)|Summary of the (?:Afterword|Preface|Introduction|Epilogue|Prologue))(?:,\s*Part\s*\d+)?\s*\((?:plain English|summary)[^)]*\)/gi;
  const ms = [...t.matchAll(re)]; if (ms.length < 3) return [];
  const map = new Map(); if (ms[0].index > 200) map.set("Introduction", t.slice(0, ms[0].index).trim());
  ms.forEach((m, i) => { const end = i + 1 < ms.length ? ms[i + 1].index : t.length, lab = cap(m[1].replace(/^Summary of the\s+/i, "").replace(/\s+/g, " "));
    map.set(lab, (map.get(lab) ? map.get(lab) + " " : "") + t.slice(m.index + m[0].length, end).trim()) });
  return [...map].map(([label, text]) => ({ label, text: first(text, 1500) }));
}
export function buildIndex(book, sum) {
  const X = {}, b = make(book, 200, 160, true); X.B = stats(b.chunks); X.BL = b.L; X.words = book.split(" "); X.nw = X.words.map(norm);
  X.secs = sections(sum || ""); X.secMap = new Map(X.secs.map(s => [s.label, s.text]));
  X.S = stats(X.secs.length ? X.secs.flatMap(s => { const w = s.text.split(" "), o = []; for (let i = 0; i < w.length; i += 110) o.push(mk(w.slice(i, i + 140).join(" "), s.label)); return o })
    : make(sum || "x", 140, 110, false).chunks);
  const w = norm(book).split(" "); X.bookN = w.join(" "); X.tri = new Set(); for (let i = 0; i < w.length - 2; i++) X.tri.add(w[i] + " " + w[i + 1] + " " + w[i + 2]);
  X.overview = n => X.secs.filter(s => /^(Letter|Chapter|Part|Book|Act|Scene|Volume) /.test(s.label)).map(s => `${s.label}: ${lead(s.text, n)}`).join("\n");
  return X
}
export function found(X, q) {   // is this quote really in the book? ("..." joins pieces, each checked alone)
  const ps = q.split(/\.\.\.|…/).map(norm).filter(Boolean); if (!ps.length) return false;
  return ps.every(n => { if (X.bookN.includes(n)) return true; const w = n.split(" "); if (w.length < 4) return false; let h = 0, t = 0;
    for (let i = 0; i < w.length - 2; i++) { t++; if (X.tri.has(w[i] + " " + w[i + 1] + " " + w[i + 2])) h++ } return h / t >= .8 })
}
function search(X, q, k, pool) {
  const qt = toks(q), N = X.chunks.length;
  return (pool || X.chunks).map(c => { let s = 0; for (const x of qt) { const f = c.tf[x]; if (!f) continue; s += Math.log(1 + (N - X.df[x] + .5) / (X.df[x] + .5)) * f * 2.5 / (f + 1.5 * (.25 + .75 * c.t.length / X.avg)) } return { c, s } })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.c)
}
const H = c => ({ label: c.label, text: c.text }), N = c => ({ label: c.label + " notes", text: c.text });
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function secRef(q) { const m = q.match(/\b(chapter|letter)s?\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i); if (!m) return null; const n = m[2].toLowerCase(); return { label: cap(m[1]) + " " + (NUM[n] || +n), rest: q.replace(m[0], " ") } }
const BROAD = /\b(summar\w*|overview|synopsis|recap|whole (book|story|novel)|entire (book|story|novel)|plot|what (is|was) (this|the) (book|story|novel) about|what happens|main (characters|themes|ideas|events)|characters|themes?|ending|beginning|timeline|narrators?|setting)\b/i;
const AUTHOR = /\b(author|writer|who wrote|biograph\w*|mary shelley|shelley|when (was|did)\b.*\b(written|wrote|write|published)|why did\b.*\bwrite|background|context|preface|introduction)\b/i;
const QTOPIC = new Set("quote quotes quotation quotations essay essays exam use used using can give me some good best important famous key about for on in".split(" "));
function wordQ(q) {
  if (!/\b(mean|meaning|means|define|definition|synonym)\b/i.test(q)) return null;
  const m = q.match(/["“'‘]([A-Za-z-]{3,})["”'’]/) || q.match(/\bword\s+([A-Za-z-]{3,})/i) || q.match(/\b(?:meaning of|define|definition of|what does)\s+(?:the word\s+)?([A-Za-z-]{3,})/i) || q.match(/\b([A-Za-z-]{3,})\s+mean\b/i);
  return m ? m[1].toLowerCase() : null
}
function wordHits(X, w, k) {
  const ok = new Set([w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "ly", w.replace(/e$/, "") + "ing"]), at = [];
  X.nw.forEach((x, i) => { if (ok.has(x)) at.push(i) });
  const pick = at.length <= k ? at : Array.from({ length: k }, (_, j) => at[Math.floor(j * at.length / k)]);
  return pick.map(i => ({ label: X.BL[i], text: X.words.slice(Math.max(0, i - 35), i + 36).join(" ") }))
}
function spread(X, k) {
  const c = X.B.chunks.filter(c => /^(Letter|Chapter)/.test(c.label)); if (!c.length) return [];
  return Array.from({ length: k }, (_, j) => H(c[Math.floor((j + .5) * c.length / k)]))
}
// Returns { hits: book passages (quotable), notes: study notes (not quotable), kind }
export function evidence(X, q, lite, deep) {   // deep = the student asked for more detail
  const kB = lite ? 3 : deep ? 7 : 5, kS = lite ? 1 : deep ? 3 : 2, quote = /\bquotes?\b|\bquotations?\b/i.test(q), ref = secRef(q);
  if (ref && X.secMap.has(ref.label)) {
    const cs = X.B.chunks.filter(c => c.label === ref.label), rest = toks(ref.rest).length ? search(X.B, ref.rest, deep ? 3 : 2, cs) : [];
    return { kind: "section", notes: [{ label: ref.label + " notes", text: first(X.secMap.get(ref.label), lite ? 220 : deep ? 1100 : 520) }], hits: (rest.length ? rest : cs.slice(0, lite ? 1 : deep ? 3 : 2)).map(H) }
  }
  const wq = wordQ(q);
  if (wq) { const h = wordHits(X, wq, lite ? 3 : deep ? 6 : 4); if (h.length) return { kind: "word", hits: h, notes: search(X.S, wq, 1).map(N) } }
  const topic = norm(q).split(" ").filter(w => w && !STOP.has(w) && !QTOPIC.has(w));
  if (quote && !topic.length) return { kind: "quotes", hits: spread(X, kB), notes: X.secs.length ? [{ label: "Overview of the whole book", text: X.overview(lite ? 20 : 35) }] : [] }
  if (AUTHOR.test(q) && X.secMap.has("Introduction"))
    return { kind: "author", hits: [], notes: [{ label: "About the author and the book's background", text: first(X.secMap.get("Introduction"), lite ? 300 : deep ? 900 : 600) }, ...search(X.S, q, lite ? 0 : 1).map(N)] }
  if (BROAD.test(q) && toks(q).length <= 6 && X.secs.length)
    return { kind: "broad", hits: [], notes: [{ label: "Overview of the whole book, chapter by chapter", text: X.overview(lite ? 28 : deep ? 75 : 50) }, ...(/themes?/i.test(q) && !lite ? search(X.S, "themes to review key themes", 2).map(N) : [])] }
  return { kind: "search", hits: search(X.B, q, kB).map(H), notes: search(X.S, q, kS).map(N) }
}
