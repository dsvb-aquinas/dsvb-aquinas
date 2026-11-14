import { WORKER_URL } from "./config.js";
import { buildPrompt } from "./prompt.js";
import { buildIndex, evidence, found, norm, toks } from "./retrieve.js";
const $ = s => document.querySelector(s);
const id = new URLSearchParams(location.search).get("b");
const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const LS = { get: k => { try { return localStorage.getItem(k) } catch {} }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} }, del: k => { try { localStorage.removeItem(k) } catch {} } };
let book = "", sum = "", title = "this text", X = null, gpu = null, cpu = null, llm = null, busy = false, MODE = "normal", how = "", ENG = "gpu", hist = [];

async function loadText(u) { const r = await fetch(u); if (!r.ok) throw 0; return (await r.text()).replace(/\s+/g, " ").trim() }
async function init() {
  try {
    const m = (await (await fetch("books/books.json")).json()).find(x => x.id === id); if (!m) throw 0;
    title = m.title; $("#title").textContent = m.title; $("#by").textContent = `${m.author}${m.year ? ", " + m.year : ""}`; document.title = `DSVB | ${m.title}`;
    book = await loadText(`books/${id}/book.txt`); try { sum = await loadText(`books/${id}/summary.txt`) } catch {}
  } catch { $("#title").textContent = "Text not found"; $("#by").textContent = "Go back and pick a text, or use your own file below." }
  $("#plain").disabled = $("#off").disabled = false;
  if (WORKER_URL) $("#online").disabled = false; else $("#onCard").querySelector("p").textContent = "Not set up yet. The site owner needs to add the Worker link (see the setup guide).";
  setEng(navigator.gpu ? "gpu" : "cpu");
  if (!navigator.gpu) { $('[data-e="gpu"]').disabled = true; $("#ps").textContent = "This device has no WebGPU, so the CPU option is the one for you." }
}
function setEng(e) {
  ENG = e; document.querySelectorAll("#eng [data-e]").forEach(b => b.classList.toggle("on", b.dataset.e === e));
  $("#gpuList").style.display = e === "gpu" ? "block" : "none"; $("#cpuList").style.display = e === "cpu" ? "block" : "none";
  $("#engNote").textContent = e === "gpu" ? "Fast, but needs a recent Chrome or Edge with WebGPU." : "Works on any device, even without a graphics chip. Slower: expect a few words per second. Tiny is the best choice for older laptops."
}
$("#eng").onclick = e => { const b = e.target.closest("[data-e]"); if (b && !b.disabled) setEng(b.dataset.e) };
$("#offBox").addEventListener("toggle", async () => {
  if (!$("#offBox").open || llm || !navigator.gpu) return;
  try { llm = await import("./web-llm.js") } catch { return }
  for (const r of document.querySelectorAll("input[name=m]")) { let c = false; try { c = await llm.hasModelInCache(r.value) } catch {} r.parentElement.querySelector("[data-s]").textContent = c ? "saved on this device" : "" }
});
$("#own").onchange = async e => { const f = e.target.files[0]; if (!f) return;
  book = (await f.text()).replace(/\s+/g, " ").trim(); sum = ""; title = f.name.replace(/\.\w+$/, ""); $("#title").textContent = title; $("#by").textContent = "Your own file"; X = null };

function verify(txt) {
  let n = 0, bad = 0;
  const clean = txt.replace(/(“[^”]*”|"[^"]*")|\s*[—–]\s*/g, (m, q) => q || ", ");   // no em dashes outside quotes
  const html = esc(clean).replace(/(?:"|“)([^"”]{25,}?)(?:"|”)/g, (m, q) => { const ok = found(X, q); n++; if (!ok) bad++; return ok ? `<mark>“${q}”</mark>` : `<span class="uq">“${q}”</span>` });
  return { html, n, bad }
}
function fmt(h) {   // tidy text into paragraphs and lists
  h = h.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*([^*\n]+)\*/g, "<i>$1</i>");
  const out = []; let li = null; const flush = () => { if (li) { out.push("<ul>" + li.map(x => `<li>${x}</li>`).join("") + "</ul>"); li = null } };
  for (const line of h.split("\n")) { const m = line.match(/^\s*[-•]\s+(.*)/); if (m) { (li = li || []).push(m[1]); continue } flush(); if (line.trim()) out.push(`<p>${line}</p>`) }
  flush(); return out.join("")
}
function add(c, h) { const d = document.createElement("div"); d.className = c; d.innerHTML = h; $("#log").append(d); d.scrollIntoView({ block: "end", behavior: "smooth" }); return d }
const dots = '<span class="dots"><i></i><i></i><i></i></span>';
const needsHist = q => hist.length && q.split(/\s+/).length <= 8 && /\b(it|that|this|them|he|she|they|still|more|again|simpler|understand|explain|why|mean|example)\b/i.test(q);
const short = (t, n) => t.split(" ").slice(0, n).join(" ") + (t.split(" ").length > n ? "…" : "");

function openChat(msg) {
  $("#setup").style.display = "none"; $("#chat").style.display = "block"; $("#ask").style.display = "block";
  $("#chips").innerHTML = ["Summarise the book simply", "Tell me about the author", "Who are the main characters?", "What are the main themes?", "Quotes I can use in an essay", "What does a word mean?"].map(t => `<button class="chip">${t}</button>`).join("");
  add("a", `<p>${msg}</p>`);
}
function sources(ev) {
  const h = ev.hits.map(x => `<p><b>${esc(x.label)}:</b> ${esc(x.text)}</p>`), n = ev.notes.map(x => `<p><b>${esc(x.label)}:</b> ${esc(short(x.text, 90))}</p>`);
  return h.length + n.length ? `<details><summary>What I looked at</summary>${h.join("")}${n.join("")}</details>` : ""
}
function render(box, ans, ev, q, mode, ck, eq) {
  const v = verify(ans);
  box.innerHTML = `<div class="t">${fmt(v.html)}</div>` + (v.n ? `<div class="note">${v.n - v.bad} of ${v.n} quotes checked against the book${v.bad ? ". Quotes with a dotted line could not be matched exactly, so double-check them before using them." : " ✓"}</div>` : "") +
    `<div class="acts"><button data-a="retry">↻ Try again</button><button data-a="more">More detail</button><button data-a="simple">Explain simpler</button></div>` + sources(ev);
  box.dataset.q = q; box.dataset.mode = mode; box._ans = ans; box._ev = ev; box._evq = eq || q;
  if (ck) { if (v.bad === 0 && (v.n > 0 || ev.notes.length)) LS.set(ck, ans); else LS.del(ck) }   // only keep answers whose quotes were all real
  box.scrollIntoView({ block: "end", behavior: "smooth" })
}

async function ask(q, o = {}) {
  q = (q || "").trim(); if (!q || busy) return; busy = true;
  const mode = o.mode || MODE, lite = how === "gpu" || how === "cpu"; $("#chips").style.display = "none";
  if (!o.replace) add("u", esc(q));
  const box = o.replace || add("a", dots); if (o.replace) box.innerHTML = dots;
  let ev = { hits: [], notes: [] };
  try {
    const evq = o.evq || q, fresh = o.ev || evidence(X, evq, lite, o.deep), follow = !o.hist && !o.ev && needsHist(q) && fresh.kind === "search" && toks(q).length <= 3;   // short follow-ups reuse the last evidence
    const sendHist = (o.hist || (follow ? hist.slice(-2) : [])).map(({ q, a }) => ({ q, a }));
    ev = follow ? hist[hist.length - 1].ev : fresh; const eq = follow ? hist[hist.length - 1].evq : evq;
    if (how === "plain") { box.innerHTML = ev.hits.length || ev.notes.length ? "<p>Closest matches in the text:</p>" + sources(ev).replace("<details>", "<details open>") : "<p>Nothing in the text matches that. Try names or events from the book.</p>"; return }
    const ck = id && !sendHist.length && (ev.hits.length || ev.notes.length) ? `dsvb:c3:${id}|${mode}|${norm(q)}` : null;
    if (ck && !o.retry) { const c = LS.get(ck); if (c) { render(box, c, ev, q, mode, null, eq); hist.push({ q, a: c.slice(0, 600), ev, evq: eq }); return } }
    if (ck && o.retry) LS.del(ck);
    const passages = ev.hits.map(h => ({ l: h.label, t: h.text })), bg = ev.notes.map(n => `(${n.label}) ${n.text}`);
    let ans;
    if (how === "online") {
      const r = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ book: id || "own", title, q, mode, retry: !!o.retry, hist: sendHist, passages, bg }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "The AI is busy right now. Please try again in a moment.");
      ans = j.answer;
    } else ans = await offlineAnswer(q, mode, passages, bg, sendHist, box);
    render(box, ans, ev, q, mode, ck, eq); hist.push({ q, a: ans.slice(0, 600), ev, evq: eq });
  } catch (e) {
    box.innerHTML = `<p>${esc(e.message || "Something went wrong.")}</p><div class="acts"><button data-a="retry">↻ Try again</button></div>` + sources(ev);
    box.dataset.q = q; box.dataset.mode = mode; box._ev = ev; box._evq = q;
  } finally { busy = false }
}

// ---------- offline engines ----------
async function loadGpu() {
  if (!llm) llm = await import("./web-llm.js"); $("#bar").style.display = "block";
  gpu = await llm.CreateMLCEngine($("input[name=m]:checked").value, { appConfig: { ...llm.prebuiltAppConfig, useIndexedDBCache: true },
    initProgressCallback: r => { $("#fill").style.width = r.progress * 100 + "%"; $("#ps").textContent = r.text } });
}
async function loadCpu() {
  const { Wllama } = await import("./wllama/index.min.js"), [repo, file] = $("input[name=c]:checked").value.split("|");
  cpu = new Wllama({ default: new URL("./wllama/wllama.wasm", import.meta.url).href }); $("#bar").style.display = "block"; $("#ps").textContent = "Starting…";
  await cpu.loadModelFromHF({ repo, file }, { n_ctx: 4096, n_gpu_layers: 0,   // n_gpu_layers 0 = CPU only
    progressCallback: ({ loaded, total }) => { const p = total ? loaded / total : 0; $("#fill").style.width = p * 100 + "%"; $("#ps").textContent = `Downloading ${Math.round(p * 100)}% (only the first time)` } });
  $("#ps").textContent = "Ready.";
}
async function offlineAnswer(q, mode, passages, bg, h, box) {
  const messages = [{ role: "system", content: buildPrompt({ title, mode, passages, bg }) }, ...h.flatMap(x => [{ role: "user", content: x.q }, { role: "assistant", content: x.a }]), { role: "user", content: q }];
  const run = async () => { let out = "";
    const s = await (how === "cpu" ? cpu.createChatCompletion({ messages, stream: true, temperature: .2, max_tokens: 600 }) : gpu.chat.completions.create({ messages, stream: true, temperature: .2, max_tokens: 700 }));
    for await (const c of s) { out += c.choices[0]?.delta?.content || ""; box.textContent = out } return out };
  try { return await run() }
  catch (e) { if (/dispos|not loaded|device|lost|memory/i.test(e.message || "")) { box.innerHTML = "<p>Waking the model up again…</p>"; await (how === "cpu" ? loadCpu() : loadGpu()); return await run() } throw e }
}
function fail(m) { $("#prob").style.display = "block"; $("#prob").textContent = m; $("#bar").style.display = "none" }
function begin() { if (!book) { fail("No text is loaded yet."); return false } X = buildIndex(book, sum); $("#prob").style.display = "none"; return true }

$("#online").onclick = () => { if (!begin()) return; how = "online"; openChat(`Hi! I'm your study buddy for <b>${esc(title)}</b>. Ask me anything, big or small. I can explain, summarise, find quotes or explain words. What would you like to know?`) };
$("#plain").onclick = () => { if (!begin()) return; how = "plain"; openChat("Search mode. Type a question and I'll show the closest matches from the text.") };
$("#off").onclick = async () => {
  if (!begin()) return; $("#off").disabled = true;
  try { if (ENG === "gpu") { if (!navigator.gpu) throw new Error("This browser has no WebGPU. Try the CPU option, Chrome or Edge, or use Online."); await loadGpu() } else await loadCpu();
    how = ENG; openChat(`Hi! I'm ready, even without internet. Ask me anything about <b>${esc(title)}</b>. I'm a small model, so my answers are simpler than Online mode.`) }
  catch (e) { fail((e.message || e) + " You can try again, pick a smaller model, or use Online.") }
  $("#off").disabled = false;
};
$("#send").onclick = () => { const q = $("#q").value; $("#q").value = ""; ask(q) };
$("#q").onkeydown = e => { if (e.key === "Enter") $("#send").click() };
$("#chips").onclick = e => { const b = e.target.closest("button"); if (!b) return;
  if (/word/.test(b.textContent)) { $("#q").value = "What does the word  mean in the book?"; $("#q").focus(); $("#q").setSelectionRange(18, 18) } else { $("#chips").style.display = "none"; ask(b.textContent) } };
$("#modes").onclick = e => { const b = e.target.closest("button"); if (!b) return;
  if (b.id === "chg") return location.reload();
  MODE = b.dataset.m; document.querySelectorAll("#modes [data-m]").forEach(x => x.classList.toggle("on", x === b)) };
$("#log").onclick = e => { const b = e.target.closest("button[data-a]"); if (!b) return; const a = b.closest(".a"), prev = [{ q: a.dataset.q, a: (a._ans || "").slice(0, 600) }];
  if (b.dataset.a === "retry") ask(a.dataset.q, { retry: true, mode: a.dataset.mode, replace: a, ev: a._ev, evq: a._evq });
  else if (b.dataset.a === "more") ask(a.dataset.q, { retry: true, mode: "detailed", replace: a, deep: true, evq: a._evq, hist: prev });   // fetch bigger evidence, ask for a fuller answer
  else ask(a.dataset.q, { retry: true, mode: "simple", replace: a, ev: a._ev, evq: a._evq, hist: prev }) };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
init();
