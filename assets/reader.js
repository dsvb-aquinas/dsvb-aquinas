import { WORKER_URL } from "./config.js";
import { buildPrompt } from "./prompt.js";
const $ = s => document.querySelector(s);
const id = new URLSearchParams(location.search).get("b");
const STOP = new Set("the a an and or of to in is was were be been it that this with as for on by at from but not he she his her they them i you we my me our your what who why how did does do which when where about would could should are has have had its than then so if".split(" "));
const norm = t => t.toLowerCase().replace(/['’‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const toks = t => norm(t).split(" ").filter(w => w && !STOP.has(w)).map(w => w.replace(/(ing|ed|es|s)$/, ""));
const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const LS = { get: k => { try { return localStorage.getItem(k) } catch {} }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} }, del: k => { try { localStorage.removeItem(k) } catch {} } };
let book = "", sum = "", title = "this text", B, S, tri, bookN, engine = null, llm = null, busy = false, MODE = "normal", how = "", hist = [];

async function loadText(u) { const r = await fetch(u); if (!r.ok) throw 0; return (await r.text()).replace(/\s+/g, " ").trim() }
async function init() {
  try {
    const m = (await (await fetch("books/books.json")).json()).find(x => x.id === id); if (!m) throw 0;
    title = m.title; $("#title").textContent = m.title; $("#by").textContent = `${m.author}${m.year ? ", " + m.year : ""}`; document.title = `DSVB | ${m.title}`;
    book = await loadText(`books/${id}/book.txt`); try { sum = await loadText(`books/${id}/summary.txt`) } catch {}
  } catch { $("#title").textContent = "Text not found"; $("#by").textContent = "Go back and pick a text, or use your own file below." }
  $("#plain").disabled = $("#off").disabled = false;
  if (WORKER_URL) $("#online").disabled = false; else { $("#onCard").querySelector("p").textContent = "Not set up yet. The site owner needs to add the Worker link (see the setup guide)." }
  if (!navigator.gpu) { $("#off").disabled = true; $("#ps").textContent = "This browser can't run offline models (no WebGPU). Online mode works on any device." }
}
$("#offBox").addEventListener("toggle", async () => {
  if (!$("#offBox").open || llm) return;
  try { llm = await import("./web-llm.js") } catch { return }
  for (const r of document.querySelectorAll("input[name=m]")) { let c = false; try { c = await llm.hasModelInCache(r.value) } catch {} r.dataset.c = c ? 1 : ""; r.parentElement.querySelector("[data-s]").textContent = c ? "saved on this device" : "" }
});
$("#own").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  book = (await f.text()).replace(/\s+/g, " ").trim(); sum = ""; title = f.name.replace(/\.\w+$/, ""); $("#title").textContent = title; $("#by").textContent = "Your own file"; B = null };

function make(text, size, step, lab) {
  const w = text.split(" "), L = [], chunks = [], df = {}; let cur = "Opening";
  for (let i = 0; i < w.length; i++) {
    if (lab && /^(LETTER|CHAPTER|PART|BOOK|ACT|SCENE|VOLUME)$/i.test(w[i]) && /^(\d+|[IVXL]+)\.?$/i.test(w[i + 1] || "")) cur = w[i][0].toUpperCase() + w[i].slice(1).toLowerCase() + " " + w[i + 1].replace(".", "");
    L[i] = cur }
  for (let i = 0; i < w.length; i += step) { const t = w.slice(i, i + size).join(" "), k = toks(t);
    chunks.push({ text: t, label: lab ? L[i] : "Summary", t: k, tf: k.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {}) }) }
  chunks.forEach(c => Object.keys(c.tf).forEach(k => df[k] = (df[k] || 0) + 1));
  return { chunks, df, avg: chunks.reduce((s, c) => s + c.t.length, 0) / Math.max(1, chunks.length) }
}
function prep() {
  B = make(book, 200, 160, true); S = make(sum || "x", 140, 110, false);
  const w = norm(book).split(" "); bookN = w.join(" "); tri = new Set();
  for (let i = 0; i < w.length - 2; i++) tri.add(w[i] + " " + w[i + 1] + " " + w[i + 2]);
}
function search(X, q, k) {
  const qt = toks(q), N = X.chunks.length;
  return X.chunks.map(c => { let s = 0; for (const x of qt) { const f = c.tf[x]; if (!f) continue; s += Math.log(1 + (N - X.df[x] + .5) / (X.df[x] + .5)) * f * 2.5 / (f + 1.5 * (.25 + .75 * c.t.length / X.avg)) } return { c, s } })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, k).map(x => x.c)
}
function found(q) {
  const n = norm(q.replace(/\.\.\.|…/g, " ")); if (bookN.includes(n)) return true;
  const w = n.split(" "); if (w.length < 4) return false; let h = 0, t = 0;
  for (let i = 0; i < w.length - 2; i++) { t++; if (tri.has(w[i] + " " + w[i + 1] + " " + w[i + 2])) h++ }
  return h / t >= .8
}
function verify(txt) {
  let n = 0, bad = 0;
  const html = esc(txt).replace(/(?:"|“)([^"”]{25,}?)(?:"|”)/g, (m, q) => { const ok = found(q); n++; if (!ok) bad++; return ok ? `<mark>“${q}”</mark>` : `<s>“${q}”</s>` });
  return { html: html.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"), n, bad }
}
function add(c, h) { const d = document.createElement("div"); d.className = c; d.innerHTML = h; $("#log").append(d); d.scrollIntoView({ block: "end", behavior: "smooth" }); return d }
const dots = '<span class="dots"><i></i><i></i><i></i></span>';
const needsHist = q => hist.length && q.split(/\s+/).length <= 8 && /\b(it|that|this|them|he|she|they|still|more|again|simpler|understand|explain|why|mean|example)\b/i.test(q);

function openChat(msg) {
  $("#setup").style.display = "none"; $("#chat").style.display = "block"; $("#ask").style.display = "block";
  $("#chips").innerHTML = ["Summarise the book simply", "Who are the main characters?", "What are the main themes?", "Quotes I can use in an essay", "What does a word mean?"].map(t => `<button class="chip">${t}</button>`).join("");
  add("a", msg);
}
function passagesHtml(hits) { return hits.length ? `<details><summary>Passages used</summary>${hits.map(h => `<p><b>${h.label}:</b> ${esc(h.text)}</p>`).join("")}</details>` : "" }
function render(box, ans, hits, q, mode, ck) {
  const v = verify(ans);
  box.innerHTML = `<div class="t">${v.html}</div>` + (v.n ? `<div class="note">${v.n - v.bad} of ${v.n} quotes checked against the book${v.bad ? ". Crossed-out quotes were not found, so please don't use them." : " ✓"}</div>` : "") +
    `<div class="acts"><button data-a="retry">↻ Try again</button><button data-a="simple">Explain simpler</button></div>` + passagesHtml(hits);
  box.dataset.q = q; box.dataset.mode = mode; box._ans = ans;
  if (ck) { if (v.n > 0 && v.bad === 0) LS.set(ck, ans); else LS.del(ck) }   // only keep answers whose quotes were all real
  box.scrollIntoView({ block: "end", behavior: "smooth" });
}

async function ask(q, o = {}) {
  q = (q || "").trim(); if (!q || busy) return; busy = true;
  const mode = o.mode || MODE, hits = search(B, q, mode === "short" ? 4 : 5), bg = search(S, q, 2);
  if (!o.replace) add("u", esc(q));
  const box = o.replace || add("a", dots); if (o.replace) box.innerHTML = dots;
  try {
    if (how === "plain") { box.innerHTML = hits.length ? "Closest passages:" + passagesHtml(hits).replace("<details>", "<details open>") : "Nothing in the text matches that. Try names or events from the book."; return }
    const sendHist = o.hist || (needsHist(q) ? hist.slice(-2) : []);
    const cacheable = !!id && hits.length && !sendHist.length, ck = cacheable ? `dsvb:c:${id}|${mode}|${norm(q)}` : null;
    if (ck && !o.retry) { const c = LS.get(ck); if (c) { render(box, c, hits, q, mode, null); hist.push({ q, a: c.slice(0, 600) }); return } }
    if (ck && o.retry) LS.del(ck);
    let ans;
    if (how === "online") {
      const r = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book: id || "own", title, q, mode, retry: !!o.retry, hist: sendHist,
        passages: hits.map(h => ({ l: h.label, t: h.text })), bg: bg.map(b => b.text.slice(0, 1200)) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The AI is busy right now. Please try again in a moment.");
      ans = j.answer;
    } else ans = await offlineAnswer(q, mode, hits, bg, sendHist, box);
    render(box, ans, hits, q, mode, ck); hist.push({ q, a: ans.slice(0, 600) });
  } catch (e) {
    box.innerHTML = `<div class="t">${esc(e.message || "Something went wrong.")}</div><div class="acts"><button data-a="retry">↻ Try again</button></div>` + passagesHtml(hits);
    box.dataset.q = q; box.dataset.mode = mode;
  } finally { busy = false }
}

async function loadEngine() {
  if (!llm) llm = await import("./web-llm.js");
  $("#bar").style.display = "block";
  engine = await llm.CreateMLCEngine($("input[name=m]:checked").value, { appConfig: { ...llm.prebuiltAppConfig, useIndexedDBCache: true },
    initProgressCallback: r => { $("#fill").style.width = r.progress * 100 + "%"; $("#ps").textContent = r.text } });
}
async function offlineAnswer(q, mode, hits, bg, h, box) {
  const messages = [{ role: "system", content: buildPrompt({ title, mode, passages: hits.map(x => ({ l: x.label, t: x.text })), bg: bg.map(b => b.text) }) },
    ...h.flatMap(x => [{ role: "user", content: x.q }, { role: "assistant", content: x.a }]), { role: "user", content: q }];
  const run = async () => { let out = ""; const s = await engine.chat.completions.create({ messages, stream: true, temperature: .2, max_tokens: 700 });
    for await (const c of s) { out += c.choices[0]?.delta?.content || ""; box.textContent = out } return out };
  try { return await run() }
  catch (e) { if (/dispos|not loaded|device|lost/i.test(e.message || "")) { box.innerHTML = "Waking the model up again…"; await loadEngine(); return await run() } throw e }
}
function fail(m) { $("#prob").style.display = "block"; $("#prob").textContent = m; $("#bar").style.display = "none" }
function begin() { if (!book) { fail("No text is loaded yet."); return false } prep(); $("#prob").style.display = "none"; return true }

$("#online").onclick = () => { if (!begin()) return; how = "online"; openChat(`Hi! I'm your study buddy for <b>${esc(title)}</b>. Ask me anything, big or small. I can explain, summarise, find quotes or explain words. What would you like to know?`) };
$("#plain").onclick = () => { if (!begin()) return; how = "plain"; openChat("Search mode. Type a question and I'll show the closest passages from the text.") };
$("#off").onclick = async () => {
  if (!begin()) return; $("#off").disabled = true;
  try { if (!navigator.gpu) throw new Error("This browser can't run offline models. Try Chrome or Edge, or use Online."); await loadEngine(); how = "offline";
    openChat(`Hi! I'm ready, even without internet. Ask me anything about <b>${esc(title)}</b>.`) }
  catch (e) { fail((e.message || e) + " You can try again, pick Light, or use Online.") }
  $("#off").disabled = false;
};
$("#send").onclick = () => { const q = $("#q").value; $("#q").value = ""; ask(q) };
$("#q").onkeydown = e => { if (e.key === "Enter") $("#send").click() };
$("#chips").onclick = e => { const b = e.target.closest("button"); if (!b) return;
  if (/word/.test(b.textContent)) { $("#q").value = "What does the word "; $("#q").focus() } else { $("#chips").style.display = "none"; ask(b.textContent) } };
$("#modes").onclick = e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "chg") return location.reload();
  MODE = b.dataset.m; document.querySelectorAll("#modes [data-m]").forEach(x => x.classList.toggle("on", x === b)) };
$("#log").onclick = e => { const b = e.target.closest("button[data-a]"); if (!b) return; const a = b.closest(".a");
  if (b.dataset.a === "retry") ask(a.dataset.q, { retry: true, mode: a.dataset.mode, replace: a });
  else ask(a.dataset.q, { retry: true, mode: "simple", replace: a, hist: [{ q: a.dataset.q, a: (a._ans || "").slice(0, 600) }] }) };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
