const $=s=>document.querySelector(s);
const id=new URLSearchParams(location.search).get("b");
const STOP=new Set("the a an and or of to in is was were be been it that this with as for on by at from but not he she his her they them i you we my me our your what who why how did does do which when where about would could should are has have had its than then so if".split(" "));
const norm=t=>t.toLowerCase().replace(/['’‘`]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const toks=t=>norm(t).split(" ").filter(w=>w&&!STOP.has(w)).map(w=>w.replace(/(ing|ed|es|s)$/,""));
const esc=s=>s.replace(/[&<>]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
let book="",sum="",B,S,tri,bookN,engine=null,busy=false,llm=null;
const model=()=>$("input[name=m]:checked").value;

async function loadText(u){const r=await fetch(u);if(!r.ok)throw 0;return(await r.text()).replace(/\s+/g," ").trim()}
async function init(){
 try{
  const list=await (await fetch("books/books.json")).json(),m=list.find(x=>x.id===id);
  if(!m)throw 0;
  $("#title").textContent=m.title;$("#by").textContent=`${m.author}${m.year?", "+m.year:""}`;document.title=`DSVB | ${m.title}`;
  book=await loadText(`books/${id}/book.txt`);
  try{sum=await loadText(`books/${id}/summary.txt`)}catch{}
 }catch{$("#title").textContent="Text not found";$("#by").textContent="Go back to the list and pick one, or choose your own file below.";$("#setup").style.display="block"}
 $("#go").disabled=$("#plain").disabled=false;
 try{llm=await import("./web-llm.js");status()}catch{}
}
async function status(){
 for(const r of document.querySelectorAll("input[name=m]")){
  let c=false;try{c=await llm.hasModelInCache(r.value)}catch{}
  r.parentElement.querySelector("[data-s]").textContent=c?"saved on this device":"not downloaded";r.dataset.c=c?1:"";
 }
 upd();
}
function upd(){$("#go").textContent=$("input[name=m]:checked").dataset.c?"Start":"Download and start"}
document.addEventListener("change",e=>{if(e.target.name==="m")upd()});

$("#own").onchange=async e=>{const f=e.target.files[0];if(!f)return;
 book=(await f.text()).replace(/\s+/g," ").trim();sum="";$("#title").textContent=f.name.replace(/\.\w+$/,"");$("#by").textContent="Your own file";B=null;$("#ps").textContent="Loaded your file. Pick a model and start."};

function make(text,size,step,lab){
 const w=text.split(" "),L=[],chunks=[],df={};let cur="Opening";
 for(let i=0;i<w.length;i++){
  if(lab&&/^(LETTER|CHAPTER|PART|BOOK|ACT|SCENE|VOLUME)$/i.test(w[i])&&/^(\d+|[IVXL]+)\.?$/i.test(w[i+1]||""))cur=w[i][0].toUpperCase()+w[i].slice(1).toLowerCase()+" "+w[i+1].replace(".","");
  L[i]=cur}
 for(let i=0;i<w.length;i+=step){const t=w.slice(i,i+size).join(" "),k=toks(t);
  chunks.push({text:t,label:lab?L[i]:"Summary",t:k,tf:k.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{})})}
 chunks.forEach(c=>Object.keys(c.tf).forEach(k=>df[k]=(df[k]||0)+1));
 return{chunks,df,avg:chunks.reduce((s,c)=>s+c.t.length,0)/Math.max(1,chunks.length)}
}
function prep(){
 B=make(book,200,160,true);S=make(sum||"x",140,110,false);
 const w=norm(book).split(" ");bookN=w.join(" ");tri=new Set();
 for(let i=0;i<w.length-2;i++)tri.add(w[i]+" "+w[i+1]+" "+w[i+2]);
}
function search(X,q,k){
 const qt=toks(q),N=X.chunks.length;
 return X.chunks.map(c=>{let s=0;for(const x of qt){const f=c.tf[x];if(!f)continue;
  s+=Math.log(1+(N-X.df[x]+.5)/(X.df[x]+.5))*f*2.5/(f+1.5*(.25+.75*c.t.length/X.avg))}return{c,s}})
  .filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,k).map(x=>x.c)
}
function found(q){
 const n=norm(q.replace(/\.\.\.|…/g," "));if(bookN.includes(n))return true;
 const w=n.split(" ");if(w.length<4)return false;let h=0,t=0;
 for(let i=0;i<w.length-2;i++){t++;if(tri.has(w[i]+" "+w[i+1]+" "+w[i+2]))h++}
 return h/t>=.8
}
function verify(txt){
 let n=0,bad=0;
 const html=esc(txt).replace(/(?:"|“)([^"”]{25,}?)(?:"|”)/g,(m,q)=>{const ok=found(q);n++;if(!ok)bad++;return ok?`<mark>“${q}”</mark>`:`<s>“${q}”</s>`});
 return{html,n,bad}
}
function add(c,h){const d=document.createElement("div");d.className=c;d.innerHTML=h;$("#log").append(d);d.scrollIntoView({block:"end"});return d}
function open_(msg){$("#setup").style.display="none";$("#log").style.display="block";$("#ask").style.display="flex";add("a",msg)}

async function start(useAI){
 if(!book){$("#why").textContent="No text is loaded yet.";$("#prob").style.display="block";return}
 prep();$("#prob").style.display="none";
 if(!useAI){open_("Search mode. Type a question and I will show the closest passages from the text.");return}
 $("#go").disabled=true;
 try{
  if(!navigator.gpu)throw new Error("This browser has no WebGPU, which the model needs. Try Chrome or Edge on a recent phone or computer.");
  if(!llm)llm=await import("./web-llm.js");
  $("#bar").style.display="block";
  engine=await llm.CreateMLCEngine(model(),{appConfig:{...llm.prebuiltAppConfig,useIndexedDBCache:true},initProgressCallback:r=>{$("#fill").style.width=r.progress*100+"%";$("#ps").textContent=r.text}});
  open_("Ready. Ask anything about the text.");
 }catch(e){
  $("#why").textContent=`${e.message||e} You can retry, pick Light, or use Search without AI.`;$("#prob").style.display="block";$("#bar").style.display="none";$("#go").disabled=false;$("#go").textContent="Try again";
 }
}
async function ask(){
 const q=$("#q").value.trim();if(!q||busy)return;$("#q").value="";busy=true;
 add("q",esc(q));const hits=search(B,q,5),bg=search(S,q,2);
 const src=`<details><summary>Passages used</summary>${hits.map(h=>`<p><b>${h.label}:</b> ${esc(h.text)}</p>`).join("")}</details>`;
 if(!hits.length){add("a","Nothing in the text matches that. Try names or events from the book.");busy=false;return}
 if(!engine){add("a","Closest passages:"+src);busy=false;return}
 const sys=`You answer questions about the text below using ONLY the excerpts.
Reason logically, step by step. Support every claim with a short DIRECT QUOTE copied exactly from the excerpts, in double quotes, followed by its label in brackets, e.g. (Letter 4). Never invent a quote. If the excerpts do not answer the question, say so plainly.
${bg.length?"\nBACKGROUND NOTES (for understanding only, never quote):\n"+bg.map(b=>b.text).join("\n"):""}
\nEXCERPTS:\n${hits.map((h,i)=>`[${i+1}] (${h.label}) ${h.text}`).join("\n\n")}`;
 const box=add("a","…");let out="";
 try{
  const s=await engine.chat.completions.create({messages:[{role:"system",content:sys},{role:"user",content:q}],stream:true,temperature:.2,max_tokens:700});
  for await(const c of s){out+=c.choices[0]?.delta?.content||"";box.textContent=out;box.scrollIntoView({block:"end"})}
  const v=verify(out);
  box.innerHTML=v.html+(v.n?`<div class="note">${v.n-v.bad} of ${v.n} quotes confirmed in the text${v.bad?". Struck-through quotes were not found.":"."}</div>`:"")+src;
 }catch(e){box.textContent="Error: "+e.message}
 busy=false
}
$("#go").onclick=()=>start(true);$("#plain").onclick=()=>start(false);
$("#send").onclick=ask;$("#q").onkeydown=e=>{if(e.key==="Enter")ask()};
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
init();
