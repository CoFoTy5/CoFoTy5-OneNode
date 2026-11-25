// LoRA 공통 규격 v2 (화면 쪽)
//  · 모델 계열 판정: anima / xl(Illustrious·NoobAI·Pony·SDXL) / sd15 / other, 모르면 "" (어느 모델에서나 보임)
//  · "지금 모델용만" 스위치: 고르기 창 · 세트 목록에 같이 적용 (브라우저에 기억, 두 팩이 같이 씀)
//  · 세트 저장: 세트 하나 단위 (서버가 파일을 다시 읽어 합쳐 씀 → 두 팩이 같은 폴더를 써도 서로 지우지 않음)
//  · 세트 = LoRA 목록 + 종류(anima/xl/sd15) + 로라 프롬프트
//  · 저장 위치 바꾸기 창
import { api } from "../../scripts/api.js";

export const LORA_CORE_VERSION = "2.0.0";

export const BASE_FAM = { Anima: "anima", Illustrious: "xl", NoobAI: "xl", SDXL: "xl", Pony: "xl", "SD1.5": "sd15", SD2: "sd15", Flux: "other", SD3: "other" };
export const FAM_NAME = { anima: "Anima", xl: "SDXL·IL", sd15: "SD1.5", other: "다른 계열", "": "모름" };
export const FAM_PFX = { anima: "An", xl: "IL", sd15: "15", "": "?" };
export function loraFam(it) {
  if (!it) return "";
  if (typeof it.fam === "string" && it.fam) return it.fam;
  if (it.base && BASE_FAM[it.base]) return BASE_FAM[it.base];
  const s = `${it.folder || ""}/${it.name || ""}`.toLowerCase();
  if (/anima|cosmos/.test(s)) return "anima";
  if (/(^|[^a-z])(il|ill|illu|illustrious|noob|noobai|sdxl|xl|pony)([^a-z]|$)/.test(s)) return "xl";
  if (/(^|[^a-z0-9])(sd ?1\.?5|sd15)([^0-9]|$)/.test(s)) return "sd15";
  return "";
}
export const famOk = (it, fam) => { const f = loraFam(it); return !f || !fam || f === fam; };
// 체크포인트 이름으로 계열 짐작 (모르면 xl)
export const ckptFam = (name) => (/(^|[^a-z0-9])(sd ?1\.?5|sd15|v1-5)([^0-9]|$)/i.test(String(name || "")) ? "sd15" : "xl");

// ---------- "지금 모델용만" (기본 켬) ----------
const FKEY = "cofoty5_lora_fam_only";
const FL = new Set();
export function famOnly() { return famOnlyG(); }
function famOnlyG() { try { return localStorage.getItem(FKEY) !== "0"; } catch { return true; } }
export function setFamOnly(v) { try { localStorage.setItem(FKEY, v ? "1" : "0"); } catch {} FL.forEach((fn) => { try { fn(v); } catch {} }); }
export function onFamOnly(fn) { FL.add(fn); return () => FL.delete(fn); }

// ---------- 세트 자동 이름: 오늘 날짜-오늘 몇 번째 (예: 261125-3) ----------
export function dateSetName(names) {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  const day = String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate());
  let max = 0;
  (names || []).forEach((k) => { const m = new RegExp("^" + day + "-(\\d+)$").exec(k); if (m) max = Math.max(max, +m[1]); });
  return `${day}-${max + 1}`;
}

// ---------- 세트 저장소 (팩마다 하나: prefix = "/model_loader" · "/cofoty5_loratester") ----------
const STORES = new Map();
export function loraStore(prefix) {
  if (STORES.has(prefix)) return STORES.get(prefix);
  const P = prefix + "/lora_store";
  const S = {
    data: { sets: {}, types: {}, prompts: {}, folder: "", default: "", is_default: true },
    loaded: false, listeners: new Set(),
    on(fn) { S.listeners.add(fn); return () => S.listeners.delete(fn); },
    _set(d) { if (d && !d.error && d.sets) { S.data = d; S.loaded = true; } S.listeners.forEach((fn) => { try { fn(S.data); } catch {} }); return d; },
    async _post(path, body) {
      const r = await api.fetchApi(P + path, { method: "POST", body: JSON.stringify(body) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      return j;
    },
    async load() { try { S._set(await (await api.fetchApi(P)).json()); } catch { S._set(null); } return S.data; },
    async put(name, loras, type, prompt, model) { return S._set(await S._post("/set", { op: "put", name, loras, type, prompt, model })); },
    async del(name) { return S._set(await S._post("/set", { op: "del", name })); },
    async rename(name, to) { return S._set(await S._post("/set", { op: "rename", name, to })); },
    // 세트에 그림 올리기 (파일 · 붙여넣기) → 그 그림이 미리보기가 됨
    async upload(name, blob) {
      const data = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
      return S._set(await S._post("/upload", { name, data, filename: blob.name || "" }));
    },
    async openFolder() { return S._post("/open", {}); },
    async setFolder(folder) { return S._set(await S._post("/folder", { folder })); },
    async pick(start) { return (await S._post("/pick", { start: start || "" })).path; },
    // 세트 목록: 지금 계열(fam)과 맞는 것 / 다른 것 (only=false면 전부 '맞는 것')
    names(fam, only = famOnly(), withHidden = false) {
      const stars = S.data.stars || [], hid = new Set(S.data.hidden || []);
      // ★ 고정이 맨 위 (고정한 순서), 나머지는 이름순 · 숨긴 세트는 빼고
      const all = Object.keys(S.data.sets || {}).filter((k) => withHidden || !hid.has(k))
        .sort((a, b) => { const ia = stars.indexOf(a), ib = stars.indexOf(b);
          if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); return a.localeCompare(b, "ko"); });
      const ok = (k) => !only || !fam || !S.data.types?.[k] || S.data.types[k] === fam;
      return { mine: all.filter(ok), other: all.filter((k) => !ok(k)) };
    },
    type(k) { return S.data.types?.[k] || ""; },
    model(k) { return S.data.models?.[k] || ""; }, // 세트를 저장할 때 쓰던 모델(체크포인트) 파일 이름
    prompt(k) { return S.data.prompts?.[k] || ""; },
    loras(k) { return (S.data.sets?.[k] || []).map((x) => ({ ...x })); },
    // 세트에 붙인 그림 (files: ComfyUI 그림 정보 {filename, subfolder, type})
    async images(name, files) { return S._set(await S._post("/images", { name, files })); },
    hasThumb(k) { return !!S.data.thumbs?.[k]; },
    isStar(k) { return (S.data.stars || []).includes(k); },
    isHidden(k) { return (S.data.hidden || []).includes(k); },
    async star(name, on) { return S._set(await S._post("/set", { op: "star", name, on })); },
    async hide(name, on) { return S._set(await S._post("/set", { op: "hide", name, on })); },
    thumbURL(k) { return api.apiURL(P + "/thumb?name=" + encodeURIComponent(k) + "&v=" + (S.data.thumbs?.[k] || 0)); },
  };
  STORES.set(prefix, S);
  return S;
}
export const setSig = (arr) => JSON.stringify((arr || []).map((x) => [x.name, +(+x.strength).toFixed(2), x.on !== false]));

// ---------- 세트 복사 · 붙여넣기 (팩 사이: 로라테스터 → 원노드 · 리암젠) ----------
//  복사: 이 브라우저(localStorage, 세 팩이 같은 키) + 시스템 클립보드(글자)에 같이 적어 둠 → 다른 주소의 ComfyUI에서도 붙여넣기 가능
// ---------- 세트에 저장한 모델 이름 ----------
export const modelShort = (m) => String(m || "").split(/[\\/]/).pop().replace(/\.(safetensors|ckpt|pt|gguf|sft)$/i, "");
export const sameModel = (a, b) => modelShort(a).toLowerCase() === modelShort(b).toLowerCase();

//  붙여넣기: 세트 선택 창의 [📋 세트 붙여넣기] 버튼으로만 (Ctrl+V는 지금처럼 커서 아래 세트의 썸네일 넣기)
const CLIP_KEY = "cofoty5_set_clip";
const blobToURL = (b) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); });
export async function copySetToClip(store, s) {
  let thumb = null;
  if (s.thumb) { try { const r = await fetch(s.thumb); if (r.ok) thumb = await blobToURL(await r.blob()); } catch {} }
  const p = { cofoty5_set: 1, name: s.name || "", loras: (s.loras || []).map((x) => ({ name: x.name, strength: +x.strength, on: x.on !== false })),
    type: s.type || "", prompt: s.prompt || "", model: s.model || "", thumb, at: Date.now() };
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(p)); }
  catch { try { localStorage.setItem(CLIP_KEY, JSON.stringify({ ...p, thumb: null })); p.noThumb = true; } catch {} }
  try { await navigator.clipboard?.writeText(JSON.stringify(p)); } catch {}
  return p;
}
async function readSetClip() {
  let a = null, b = null;
  try { const t = await navigator.clipboard?.readText(); if (t && t.trim().startsWith("{")) { const j = JSON.parse(t); if (j?.cofoty5_set) a = j; } } catch {}
  try { const j = JSON.parse(localStorage.getItem(CLIP_KEY) || "null"); if (j?.cofoty5_set) b = j; } catch {}
  return a && b ? (a.at >= b.at ? a : b) : a || b;
}
async function pasteSetFromClip(store, say) {
  const c = await readSetClip();
  if (!c) { say("복사한 세트가 없습니다 — 로라테스터의 LoRA 칸에서 [세트 복사]를 먼저 누르세요", "warn"); return; }
  const desc = `LoRA ${c.loras.length}개${c.prompt ? " · 작가 태그" : ""}${c.thumb ? " · 썸네일" : ""} (${FAM_NAME[c.type] || "모델 모름"}용${c.model ? " · 모델 " + modelShort(c.model) : ""})`;
  const n = (window.prompt(`복사한 세트를 이 노드의 세트로 저장합니다\n${desc}\n\n저장할 이름`, c.name || dateSetName(Object.keys(store.data.sets || {}))) || "").trim().slice(0, 40);
  if (!n) return;
  if (store.data.sets?.[n] && !confirm(`'${n}' 세트가 이미 있습니다. 복사한 세트로 덮어쓸까요?`)) return;
  try {
    await store.put(n, c.loras, c.type, c.prompt, c.model || "");
    if (c.thumb) store._set(await store._post("/upload", { name: n, data: c.thumb }));
    say(`세트 '${n}' 붙여넣기 완료 (${desc})`, "success");
  } catch (e) { say("세트를 붙여넣지 못했습니다: " + e.message, "error"); }
}

// ---------- 세트 고르기 · 편집 창 (LoRA 추가 창처럼: 썸네일 + 이름, 커서를 대면 크게 + 자세히) ----------
//  위쪽 동작 버튼(선택 · ★ 고정 · 숨김 · 이름 변경 · 삭제)을 먼저 고르고 카드를 누름. 기본은 '선택'(누르면 그 세트를 넣고 닫힘)
export function splitTags(p) { return String(p || "").split(",").map((t) => t.trim()).filter(Boolean); }
// 프롬프트 두 개를 합침 (같은 태그는 한 번만)
export function mergeTags(...ps) { const seen = new Set(), out = []; ps.forEach((p) => splitTags(p).forEach((t) => { const k = t.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(t); } })); return out.join(", "); }
export function openSetManager(store, { toast, theme, getFam, apply, current, kindOf, curModel } = {}) {
  const T = { text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", line: "#3a3a42", accent: "#2c8a8a", accent2: "#45b0b0", gold: "#e8c46a", warn: "#e0a040", ...(theme || {}) };
  const h = (tag, s = {}, t) => { const e = document.createElement(tag); Object.assign(e.style, s); if (t != null) e.textContent = t; return e; };
  const say = (m, s = "info") => { if (toast) toast(m, s); };
  const B = (t, fn, s = {}, tip) => { const b = h("span", { border: `1px solid ${T.line}`, borderRadius: "6px", padding: "2px 9px", cursor: "pointer", userSelect: "none",
    fontSize: "12px", display: "inline-flex", alignItems: "center", lineHeight: "18px", background: T.bg, color: T.text, whiteSpace: "nowrap", ...s }, t);
    if (tip) b.title = tip; b.onclick = (e) => { e.stopPropagation(); fn(e); }; return b; };
  const back = h("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.6)", zIndex: "10000", display: "flex", alignItems: "center", justifyContent: "center" });
  const pane = h("div", { width: "92vw", height: "88vh", background: T.bg, color: T.text, border: `1px solid ${T.accent2}`, borderRadius: "10px", display: "flex",
    flexDirection: "column", fontFamily: "sans-serif", fontSize: "12px", boxShadow: "0 10px 40px rgba(0,0,0,.6)", overflow: "hidden" });
  ["keydown", "keyup", "keypress", "wheel", "pointerdown"].forEach((ev) => pane.addEventListener(ev, (e) => e.stopPropagation(), { passive: ev === "wheel" }));
  const top = h("div", { display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderBottom: `1px solid ${T.line}`, flexWrap: "wrap" });
  const q = h("input", { background: T.bg, color: T.text, border: `1px solid ${T.line}`, borderRadius: "5px", padding: "3px 8px", fontSize: "12px", width: "180px" });
  q.placeholder = "세트 이름 · LoRA 찾기";
  const SM = [["작게", 150], ["보통", 260], ["크게", 520]], SMK = "cofoty5_setmgr_thumb3";
  let szI = 0; try { const r0 = localStorage.getItem(SMK); if (r0 !== null && +r0 >= 0 && +r0 < SM.length) szI = +r0; } catch {}
  const szB = B("", () => { szI = (szI + 1) % SM.length; try { localStorage.setItem(SMK, String(szI)); } catch {} render(); }, {}, "썸네일 크기 (LoRA 추가 창과 따로 기억)");
  // 정렬: 누를 때마다 최신순 → 등록순 → 이름순 (★ 고정은 항상 맨 위, 이름순은 모델 표시 An · IL 은 빼고 세트 이름만으로)
  const SORTS = ["최신순", "등록순", "이름순"], SOK = "cofoty5_setmgr_sort";
  let soI = 0; try { const r1 = localStorage.getItem(SOK); if (r1 !== null && +r1 >= 0 && +r1 < SORTS.length) soI = +r1; } catch {}
  const soB = B("", () => { soI = (soI + 1) % SORTS.length; try { localStorage.setItem(SOK, String(soI)); } catch {} render(); }, {}, "정렬 바꾸기: 최신순 → 등록순 → 이름순\n(★ 고정한 세트는 항상 맨 위 · 이름순은 An · IL 같은 모델 표시를 빼고 세트 이름으로 정렬)");
  const sortNames = (arr) => {
    const stars = store.data.stars || [], ord = store.data.order || Object.keys(store.data.sets || {});
    const pos = (k) => ord.indexOf(k);
    const top = arr.filter((k) => stars.includes(k)).sort((a, b) => stars.indexOf(a) - stars.indexOf(b));
    const rest = arr.filter((k) => !stars.includes(k));
    if (soI === 0) rest.sort((a, b) => pos(b) - pos(a));
    else if (soI === 1) rest.sort((a, b) => pos(a) - pos(b));
    else rest.sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
    return [...top, ...rest];
  };
  const info = h("span", { color: T.dim });
  // 동작 고르기
  const MODES = [["pick", "✔ 선택", "카드를 누르면 그 세트를 LoRA 목록에 넣고 창을 닫습니다"], ["star", "★ 고정", "카드를 누를 때마다 ★ 고정 켜기/끄기 (고정한 세트는 맨 위)"],
    ["hide", "🙈 숨김", "카드를 누를 때마다 숨김 켜기/끄기 (숨긴 세트는 이 창에서만 흐리게 보이고, 세트 이름 표시에도 안 잡힘)"],
    ["rename", "✎ 이름 변경", "카드를 누르면 새 이름을 묻습니다 (붙은 그림도 같이 옮겨짐)"],
    ["pic", "🖼 썸네일 변경", "카드를 누르면 그림 파일을 고릅니다. 카드에 커서를 두고 Ctrl+V(복사한 그림 붙여넣기)나 그림 파일을 끌어다 놓아도 됩니다 (어느 동작에서나)"], ["del", "🗑 삭제", "카드를 누르면 빨갛게 바뀌고, 한 번 더 누르면 지워집니다 (붙은 그림도 지움)"]];
  let mode = "pick";
  const modeWrap = h("span", { display: "inline-flex", border: `1px solid ${T.line}`, borderRadius: "6px", overflow: "hidden" });
  const modeBs = MODES.map(([k, t, tip]) => { const b = h("span", { padding: "3px 10px", cursor: "pointer", fontSize: "12px", whiteSpace: "nowrap", userSelect: "none" }, t); b.title = tip;
    b.onclick = (e) => { e.stopPropagation(); mode = k; st.del = null; render(); }; modeWrap.append(b); return b; });
  const hint = h("span", { color: T.gold, fontSize: "11px" });
  const openB = B("📂 폴더 열기", async () => { try { await store.openFolder(); } catch (e) { say("폴더를 열지 못했습니다: " + e.message, "warn"); } }, {}, "세트가 저장되고 있는 폴더를 엽니다");
  const folderB = B("저장 위치 변경", () => openStoreFolder(store, { toast }), { borderColor: T.gold }, "LoRA 세트 · 그림을 저장하는 폴더를 바꿉니다");
  const close = () => { back.remove(); tip.remove(); document.removeEventListener("keydown", esc, true); document.removeEventListener("paste", onPaste, true); off?.(); };
  const esc = (e) => { if (e.key === "Escape" && !document.querySelector("[data-cofoty5-folder]")) { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", esc, true);
  // 복사한 세트 붙여넣기 (로라테스터의 [세트 복사]) — 버튼으로만. Ctrl+V는 썸네일 넣기 그대로
  const clipB = B("📋 세트 붙여넣기", async () => { await pasteSetFromClip(store, say); }, { color: T.dim }, "로라테스터에서 [세트 복사]한 세트(LoRA · 작가 태그 · 이름 · 썸네일)를 이 노드의 세트로 저장합니다\n(Ctrl+V는 지금처럼 커서 아래 세트의 썸네일 넣기)");
  top.append(h("b", { fontSize: "14px" }, "LoRA 세트"), q, szB, soB, modeWrap, hint, info, h("span", { flex: "1" }), clipB, openB, folderB, B("✕ 닫기", close));
  const grid = h("div", { flex: "1", overflowY: "auto", padding: "10px", display: "grid", gap: "8px", alignContent: "start", gridAutoRows: "max-content" });
  pane.append(top, grid); back.append(pane);
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  // 커서를 대면: 큰 그림 + 자세히
  const tip = h("div", { position: "fixed", zIndex: "10003", display: "none", background: T.bg, color: T.text, border: `1px solid ${T.accent2}`, borderRadius: "8px", padding: "8px",
    boxShadow: "0 8px 30px rgba(0,0,0,.55)", pointerEvents: "none", maxWidth: "min(1060px, 70vw)", fontFamily: "sans-serif", fontSize: "12px", gap: "10px", alignItems: "flex-start" });
  const timg = h("img", { display: "block", maxWidth: "min(760px, 46vw)", maxHeight: "calc(100vh - 40px)", borderRadius: "5px", objectFit: "contain" });
  const tinfo = h("div", { width: "250px", display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.45", fontSize: "12px" });
  tip.append(timg, tinfo);
  document.body.append(tip);
  const nm = (n) => String(n).split(/[\\/]/).pop().replace(/\.safetensors$/i, "");
  // 모델 표시 (An · IL · 15): 스 · 아 · 작 처럼 테두리 있는 작은 배지
  const famBadge = (t) => h("span", { fontSize: "10px", fontWeight: "700", color: T.accent2, border: `1px solid ${T.accent2}`, borderRadius: "4px", padding: "0 3px", flexShrink: "0", lineHeight: "14px" }, FAM_PFX[t] || "?");
  const fmtS = (x) => (+(+x).toFixed(2)).toString();
  function showTip(k, card, other) {
    const L = store.loras(k), p = store.prompt(k), th = store.hasThumb(k);
    timg.style.display = th ? "block" : "none";
    if (th) timg.src = store.thumbURL(k);
    tinfo.innerHTML = "";
    const hd = h("div", { display: "flex", gap: "6px", alignItems: "baseline", flexWrap: "wrap" });
    hd.append(famBadge(store.type(k)), h("b", { fontSize: "14px", wordBreak: "break-all" }, k));
    tinfo.append(hd);
    const flags = [store.isStar(k) ? "★ 고정" : "", store.isHidden(k) ? "🙈 숨김" : "", other ? "다른 모델용 (지금 모델에서는 못 씀)" : "", k === current?.() ? "● 지금 쓰는 세트" : ""].filter(Boolean);
    if (flags.length) tinfo.append(h("div", { color: T.dim, fontSize: "11px" }, flags.join(" · ")));
    // 저장할 때 쓰던 모델 (지금 모델과 다르면 주황)
    const md = store.model(k);
    if (md) {
      const diff = curModel && curModel() && !sameModel(md, curModel());
      const mr = h("div", { display: "flex", alignItems: "center", gap: "5px", padding: "2px 6px", borderRadius: "5px", border: `1px solid ${diff ? T.warn : T.line}`, background: "rgba(127,127,127,.08)" });
      mr.append(h("span", { fontSize: "10px", fontWeight: "700", color: diff ? T.warn : T.dim, border: `1px solid ${diff ? T.warn : T.dim}`, borderRadius: "4px", padding: "0 3px", flexShrink: "0" }, "모델"),
        h("span", { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: diff ? T.warn : "" }, modelShort(md) + (diff ? "  (지금 모델과 다름)" : "")));
      mr.title = md + (diff ? `\n지금 모델: ${curModel()}` : "");
      tinfo.append(mr);
    }
    const line = (badge, col, text, val, dim) => {
      const r = h("div", { display: "flex", alignItems: "center", gap: "5px", padding: "2px 6px", borderRadius: "5px", border: `1px solid ${T.line}`, background: "rgba(127,127,127,.08)", opacity: dim ? ".45" : "1" });
      r.append(h("span", { fontSize: "10px", fontWeight: "700", color: col, border: `1px solid ${col}`, borderRadius: "4px", padding: "0 3px", flexShrink: "0" }, badge),
        h("span", { flex: "1", minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text));
      if (val != null) r.append(h("b", { color: T.gold, flexShrink: "0" }, val));
      r.title = text; return r;
    };
    L.forEach((x) => { const kd = kindOf?.(x.name) || ["L", T.accent2]; tinfo.append(line(kd[0], kd[1], nm(x.name), fmtS(x.strength), x.on === false)); });
    if (!L.length) tinfo.append(h("div", { color: T.dim }, "(LoRA 없음)"));
    // 로라 프롬프트: 작가 태그(@이름)는 '작' 줄로, 나머지는 글로
    const toks = splitTags(p), rest = [];
    toks.forEach((t) => { const m = /^\(?@(.+?)(?::([\d.]+))?\)?$/.exec(t); if (m) tinfo.append(line("작", T.gold, "@" + m[1].replace(/\\/g, ""), m[2] ?? null)); else rest.push(t); });
    if (rest.length) tinfo.append(h("div", { color: T.dim, fontSize: "11px", marginTop: "3px", borderTop: `1px solid ${T.line}`, paddingTop: "3px", wordBreak: "break-all" }, rest.join(", ")));
    if (!th) tinfo.append(h("div", { color: T.dim, fontSize: "11px", marginTop: "4px" }, "(그림 없음 — 🖼 썸네일 변경 · Ctrl+V · 끌어다 놓기)"));
    tip.style.display = "flex";
    const place = () => {
      const r = card.getBoundingClientRect(), tw = tip.offsetWidth, th2 = tip.offsetHeight;
      const right = window.innerWidth - r.right >= r.left;
      const left = right ? Math.min(r.right + 8, window.innerWidth - tw - 6) : Math.max(6, r.left - tw - 8);
      Object.assign(tip.style, { left: left + "px", top: Math.max(6, Math.min(r.top, window.innerHeight - th2 - 6)) + "px" });
    };
    place(); timg.onload = place;
  }
  const hideTip = () => { tip.style.display = "none"; };
  // 그림 넣기: 파일 고르기 · 붙여넣기(Ctrl+V) · 끌어다 놓기
  let hoverK = null;
  async function putPic(k, blob) {
    if (!blob || !/^image\//.test(blob.type || "")) { say("그림 파일이 아닙니다", "warn"); return; }
    if (store.hasThumb(k) && !confirm(`'${k}'에 이미 그림이 있습니다. 새 그림으로 바꿀까요?`)) return;
    try { await store.upload(k, blob); say(`'${k}'에 그림을 넣었습니다`, "success"); } catch (e) { say("그림을 넣지 못했습니다: " + e.message, "error"); }
  }
  const fileIn = h("input"); fileIn.type = "file"; fileIn.accept = "image/*"; fileIn.style.display = "none"; pane.append(fileIn);
  let fileK = null;
  const pickFile = (k) => { fileK = k; fileIn.value = ""; fileIn.click(); };
  fileIn.onchange = () => { const f = fileIn.files?.[0]; if (f && fileK) putPic(fileK, f); };
  const onPaste = (e) => {
    if (!hoverK || !back.isConnected) return;
    const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith("image/"));
    if (!it) { say("붙여넣을 그림이 클립보드에 없습니다 (그림을 '이미지 복사' 한 뒤 Ctrl+V)", "warn"); return; }
    e.preventDefault(); e.stopPropagation();
    putPic(hoverK, it.getAsFile());
  };
  document.addEventListener("paste", onPaste, true);
  const st = { del: null, delT: 0 };
  async function act(k, other) {
    try {
      if (mode === "pick") {
        if (other) { say("다른 모델용 세트라 지금 모델에서는 쓸 수 없습니다", "warn"); return; }
        apply?.(k); say(`세트 '${k}'을(를) 넣었습니다`, "success"); close(); return;
      }
      if (mode === "star") return void (await store.star(k, !store.isStar(k)));
      if (mode === "hide") return void (await store.hide(k, !store.isHidden(k)));
      if (mode === "pic") { hideTip(); pickFile(k); return; }
      if (mode === "rename") {
        hideTip();
        const n = (window.prompt(`'${k}'의 새 이름`, k) || "").trim().slice(0, 40);
        if (!n || n === k) return;
        if (store.data.sets?.[n]) { say(`'${n}' 이름의 세트가 이미 있습니다`, "warn"); return; }
        await store.rename(k, n); say(`'${k}' → '${n}'`, "success"); return;
      }
      if (mode === "del") {
        if (st.del !== k) { st.del = k; clearTimeout(st.delT); st.delT = setTimeout(() => { st.del = null; render(); }, 4000); return render(); }
        clearTimeout(st.delT); st.del = null; hideTip();
        await store.del(k); say(`세트 '${k}' 삭제 (붙은 그림도 지움)`, "info");
      }
    } catch (e) { say(e.message, "error"); }
  }
  function card(k, other) {
    const px = SM[szI][1], star = store.isStar(k), hid = store.isHidden(k), armed = st.del === k, cur = k === current?.();
    const c = h("div", { border: `${cur ? 2 : 1}px solid ${armed ? "#d06060" : cur ? T.accent2 : star ? T.gold : T.line}`, borderRadius: "7px", overflow: "hidden", cursor: "pointer",
      display: "flex", flexDirection: "column", background: armed ? "rgba(200,60,60,.25)" : "rgba(127,127,127,.06)", opacity: hid ? ".45" : other ? ".6" : "1", position: "relative" });
    const pic = h("div", { height: Math.round(px * 4 / 3) + "px", flexShrink: "0", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.15)", overflow: "hidden" });
    if (store.hasThumb(k)) { const im = h("img", { width: "100%", height: "100%", objectFit: "cover" }); im.loading = "lazy"; im.src = store.thumbURL(k); pic.append(im); }
    else pic.append(h("div", { color: T.dim, fontSize: "10px", padding: "6px", textAlign: "center", lineHeight: "1.4", wordBreak: "break-all" },
      store.loras(k).slice(0, 4).map((x) => nm(x.name)).join("\n") || "(LoRA 없음)"));
    pic.style.whiteSpace = "pre-line";
    const lab = h("div", { padding: "3px 5px", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px", minWidth: "0" });
    lab.append(famBadge(store.type(k)), h("span", { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0", color: star ? T.gold : "" }, (star ? "★ " : "") + (hid ? "🙈 " : "") + k));
    c.append(pic, lab);
    if (armed) c.append(h("div", { position: "absolute", left: "0", right: "0", top: "40%", textAlign: "center", fontWeight: "700", color: "#fff", background: "rgba(160,40,40,.85)", padding: "4px 0" }, "한 번 더 누르면 삭제"));
    c.onmouseenter = () => { hoverK = k; showTip(k, c, other); };
    c.onmouseleave = () => { if (hoverK === k) hoverK = null; hideTip(); };
    c.ondragover = (e) => { e.preventDefault(); c.style.outline = `2px dashed ${T.gold}`; };
    c.ondragleave = () => { c.style.outline = ""; };
    c.ondrop = (e) => { e.preventDefault(); c.style.outline = ""; const f = [...(e.dataTransfer?.files || [])][0]; if (f) putPic(k, f); };
    c.onclick = (e) => { e.stopPropagation(); act(k, other); };
    return c;
  }
  function render() {
    if (!back.isConnected && grid.childNodes.length) return;
    const f = getFam ? getFam() : "", key = q.value.trim().toLowerCase();
    const { mine, other } = store.names(f, true, true);
    const hit = (k) => !key || k.toLowerCase().includes(key) || store.loras(k).some((x) => String(x.name).toLowerCase().includes(key));
    szB.textContent = "크기: " + SM[szI][0];
    soB.textContent = "정렬: " + SORTS[soI];
    modeBs.forEach((b, i) => Object.assign(b.style, MODES[i][0] === mode ? { background: MODES[i][0] === "del" ? "#8a2c2c" : T.accent, color: "#fff" } : { background: "transparent", color: T.dim }));
    hint.textContent = "";
    grid.style.gridTemplateColumns = `repeat(auto-fill, ${SM[szI][1]}px)`;
    grid.innerHTML = ""; hideTip();
    const m = sortNames(mine.filter(hit)), o = sortNames(other.filter(hit));
    info.textContent = `${mine.length}개${other.length ? ` · 다른 모델용 ${other.length}개` : ""}${(store.data.hidden || []).length ? ` · 숨김 ${(store.data.hidden || []).length}개` : ""}`;
    m.forEach((k) => grid.append(card(k, false)));
    if (o.length) {
      grid.append(h("div", { gridColumn: "1 / -1", color: T.dim, fontSize: "11px", borderTop: `1px solid ${T.line}`, paddingTop: "6px" }, "다른 모델용 세트"));
      o.forEach((k) => grid.append(card(k, true)));
    }
    if (!m.length && !o.length) grid.append(h("div", { gridColumn: "1 / -1", color: T.dim, padding: "20px" }, key ? "찾는 세트가 없습니다" : "저장된 세트가 없습니다 — LoRA 제목 줄의 [저장]으로 만듭니다"));
  }
  q.oninput = render;
  const off = store.on(render);
  document.body.append(back);
  render(); q.focus();
}

// ---------- 저장 위치 창 ----------
export function openStoreFolder(store, { toast } = {}) {
  const C = { text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", line: "#3a3a42", accent: "#2c8a8a", accent2: "#45b0b0", warn: "#e0a040" };
  const h = (tag, s = {}, t) => { const e = document.createElement(tag); Object.assign(e.style, s); if (t != null) e.textContent = t; return e; };
  const btn = (t, fn, s = {}) => { const b = h("button", { background: "#2a2a30", color: C.text, border: `1px solid ${C.line}`, borderRadius: "5px",
    padding: "4px 10px", cursor: "pointer", fontSize: "12px", ...s }, t); b.onclick = fn; return b; };
  const back = h("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.55)", zIndex: "10002", display: "flex", alignItems: "center", justifyContent: "center" });
  back.dataset.cofoty5Folder = "1";
  const pane = h("div", { width: "560px", maxWidth: "94vw", background: "var(--comfy-menu-bg, #1e1e22)", color: C.text, border: `1px solid ${C.accent2}`,
    borderRadius: "8px", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px", boxShadow: "0 10px 30px rgba(0,0,0,.6)" });
  ["keydown", "keyup", "keypress"].forEach((ev) => pane.addEventListener(ev, (e) => e.stopPropagation()));
  back.append(pane);
  const close = () => back.remove();
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  const say = (m, s = "info") => { if (toast) toast(m, s); };

  const cur = h("div", { wordBreak: "break-all", padding: "6px 8px", background: C.bg, border: `1px solid ${C.line}`, borderRadius: "5px" });
  const inp = h("input", { background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: "4px", padding: "5px 7px", fontSize: "12px", flex: "1", minWidth: "0" });
  inp.placeholder = "폴더 경로 (비우면 기본 폴더)";
  const render = () => {
    const d = store.data;
    cur.textContent = (d.folder || "?") + (d.is_default ? "  (기본 폴더)" : "");
    if (!inp.value) inp.value = d.folder || "";
  };
  const apply = async (path) => {
    try {
      const d = await store.setFolder(path);
      render();
      say(d.copied?.length ? `저장 위치를 바꾸고 없는 파일을 복사했습니다: ${d.folder}` : `저장 위치: ${d.folder}` + (d.exists ? " (그 폴더의 세트를 씁니다)" : ""), "success");
    } catch (e) { say("저장 위치를 바꾸지 못했습니다: " + e.message, "error"); }
  };
  const row = h("div", { display: "flex", gap: "6px", alignItems: "center" });
  const pickB = btn("폴더 고르기…", async () => {
    if (pickB.disabled) return;
    const label = pickB.textContent; pickB.disabled = true; pickB.textContent = "창 여는 중…";
    say("폴더 고르기 창을 띄웠습니다. 안 보이면 작업 표시줄을 확인해 주세요", "info");
    try {
      const p = await store.pick(inp.value || store.data.folder);
      if (p) { inp.value = p; say("폴더를 골랐습니다. [이 위치 쓰기]를 눌러 주세요", "success"); }
      else if (p === null) say("폴더 고르기 창을 띄울 수 없습니다. 경로를 직접 붙여 넣어 주세요 (ComfyUI 검은 창에 원인이 나옵니다)", "warn");
      else say("폴더 고르기를 취소했습니다", "info");
    } catch (e) { say(e.message, "error"); }
    finally { pickB.disabled = false; pickB.textContent = label; }
  });
  row.append(inp, pickB);
  const acts = h("div", { display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" });
  acts.append(
    btn("기본 위치로", () => { inp.value = ""; apply(""); }),
    btn("이 위치 쓰기", () => { const p = inp.value.trim(); if (p) apply(p); }, { background: C.accent, borderColor: C.accent2, color: "#fff" }),
    btn("닫기", close));
  pane.append(
    h("b", { fontSize: "14px" }, "저장 위치 (LoRA 세트 · 태그 사전)"),
    h("div", { color: C.dim, lineHeight: "1.55" },
      "LoRA 세트(목록 · 로라 프롬프트 · 모델 종류) · 직접 고친 LoRA 키워드 · 태그 사전 · 고친 한글 뜻 · 번역 저장이 이 폴더에 저장됩니다.\n" +
      "다른 ComfyUI의 OneNode도 같은 폴더를 고르면 같이 쓰고, 다른 폴더면 따로 씁니다.\n" +
      "새 폴더에 파일이 있으면 그 파일을 쓰고, 없는 파일만 지금 것을 복사해서 시작합니다 (덮어쓰지 않음). 비워 두고 적용하면 기본 공용 폴더로 돌아갑니다.\n" +
      "기본: 이 ComfyUI 안의 user\\cofoty5 — 따로 깐 ComfyUI는 각자 씀. ComfyUI 폴더를 지우면 함께 지워짐"),
    h("div", { color: C.dim }, "지금 위치"), cur, row, acts);
  pane.querySelectorAll("div").forEach((d) => { if (d.textContent.includes("\n")) d.style.whiteSpace = "pre-line"; });
  document.body.append(back);
  store.load().then(render);
  render();
}

// ---------- 세트 줄 ----------
//  opts: store, theme, getL()/setL(arr), getFam() → "anima"|"xl"|"sd15", getP()/setP(text) (로라 프롬프트, 없으면 칸 없음), toast
//  돌려줌: { head: [지금 세트 이름, 세트 선택, 저장], body: (저장 줄 + 로라 프롬프트 칸), render() }
//  세트는 항상 지금 모델(체크포인트) 계열에 맞는 것만 · 고르기 · 삭제 · 이름 변경 · ★ · 숨김은 [세트 선택] 창에서
export function setBar(opts) {
  const { store, getL, setL, getFam, getP, setP, toast } = opts;
  const T = { text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", line: "#3a3a42", accent: "#2c8a8a", accent2: "#45b0b0", gold: "#e8c46a", warn: "#e0a040", ...(opts.theme || {}) };
  const h = (tag, s = {}, t) => { const e = document.createElement(tag); Object.assign(e.style, s); if (t != null) e.textContent = t; return e; };
  const noKeys = (el) => ["keydown", "keyup", "keypress"].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
  const INP = { background: T.bg, color: T.text, border: `1px solid ${T.line}`, borderRadius: "4px", padding: "1px 4px", fontSize: "11px", boxSizing: "border-box", outline: "none", minWidth: "0" };
  const chip = (t, title, fn) => { const b = h("span", { border: `1px solid ${T.line}`, borderRadius: "8px", padding: "0 6px", cursor: "pointer", userSelect: "none",
    fontSize: "11px", display: "inline-flex", alignItems: "center", lineHeight: "17px", background: T.bg, color: T.text, flexShrink: "0" }, t);
    b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(e); }; return b; };
  const say = (m, s, life) => { if (toast) toast(m, s, life); };
  const st = { saving: false };
  const fam = () => getFam() || "";
  const curName = h("span", { fontSize: "11px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: "0", flex: "0 1 auto", maxWidth: "170px",
    color: T.dim, border: `1px solid ${T.line}`, borderRadius: "5px", padding: "1px 8px", background: T.bg, lineHeight: "16px", marginLeft: "4px" });
  const pickB = chip("세트 선택", "저장한 LoRA 세트를 썸네일로 보고 골라 넣습니다 (★ 고정 · 숨김 · 이름 변경 · 삭제도 여기서)", () =>
    openSetManager(store, { toast, theme: T, getFam: fam, current, kindOf: opts.kindOf, curModel: opts.getModel,
      apply: (k) => {
        setL(store.loras(k)); if (setP) setP(store.prompt(k)); opts.onApply?.(k); render();
        // 세트를 저장할 때 쓰던 모델과 지금 모델이 다르면 한 번 알림 (그림체가 많이 달라질 수 있음)
        const m = store.model(k), now = opts.getModel?.() || "";
        if (m && now && !sameModel(m, now)) setTimeout(() => say(`⚠ 세트 '${k}'는 모델 '${modelShort(m)}'로 만든 세트입니다. 지금 모델은 '${modelShort(now)}'라 결과가 다르게 나올 수 있습니다.`, "warn", "model"), 50);
      } }));
  Object.assign(pickB.style, { background: T.accent, borderColor: T.accent2, color: "#fff" });
  const saveB = chip("저장", "지금 LoRA 조합(과 로라 프롬프트)을 세트로 저장", () => { st.saving = !st.saving; render(); });
  const saveRow = h("div", { display: "none", alignItems: "center", gap: "3px" });
  const body = h("div", { display: "flex", flexDirection: "column", gap: "3px" });
  body.append(saveRow);
  let pBox = null, pHint = null, pCb = null;
  if (getP && setP) {
    const wrap = h("div", { display: "flex", flexDirection: "column", gap: "1px", position: "relative" });
    pHint = h("span", { color: T.warn, fontSize: "10px", position: "absolute", right: "6px", bottom: "3px", pointerEvents: "none" });
    pBox = h("textarea", { ...INP, width: "100%", minHeight: "34px", height: "34px", resize: "vertical", padding: "2px 5px", fontFamily: "inherit", lineHeight: "1.35" });
    pBox.placeholder = "작가 태그 등 (예: @wanke, (@tiv:1.06)) — 품질 뒤에 들어감";
    pBox.title = "작가 태그 등. 실행할 때 품질 바로 뒤(캐릭터 앞)에 그대로 들어갑니다. 세트를 저장하면 같이 저장되고, 세트를 고르면 세트의 것으로 바뀝니다.";
    noKeys(pBox);
    pBox.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    pBox.oninput = () => { setP(pBox.value); hint(); };
    // 왼쪽: 켜기/끄기 체크박스 + ✕ 지우기 (LoRA 줄과 같은 방식) — opts.promptOn = { get(), set(bool) } 를 주면 나타남
    const side = h("div", { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", flexShrink: "0", width: "16px", padding: "1px 0" });
    pCb = document.createElement("input"); pCb.type = "checkbox"; Object.assign(pCb.style, { margin: "0", cursor: "pointer" });
    pCb.title = "체크하면 이 칸의 글자를 생성에 씁니다 (끄면 글자는 남기고 생성에만 안 씀 · 흐리게)";
    pCb.onchange = () => { opts.promptOn?.set(pCb.checked); render(); };
    const pX = h("span", { cursor: "pointer", color: T.dim, fontSize: "12px", lineHeight: "12px", userSelect: "none" }, "✕");
    pX.title = "이 칸의 글자를 모두 지웁니다";
    pX.onclick = () => { if (!pBox.value) return; setP(""); pBox.value = ""; render(); };
    side.append(pCb, pX);
    const rowP = h("div", { display: "flex", gap: "4px", alignItems: "stretch" });
    if (!opts.promptOn) pCb.style.display = "none";
    wrap.style.flex = "1"; wrap.style.minWidth = "0";
    wrap.append(pBox, pHint);
    rowP.append(side, wrap);
    body.append(rowP);
  }
  function current() {
    const sig = setSig(getL());
    return store.names(fam(), true, true).mine.find((k) => setSig(store.data.sets[k]) === sig) || "";
  }
  function hint() {
    if (!pHint) return;
    const cur = current();
    pHint.textContent = cur && (getP() || "") !== store.prompt(cur) ? "세트와 다름 (저장 버튼으로 저장)" : "";
  }
  let seen = false, off1 = null;
  function render() {
    if (curName.isConnected) seen = true;
    else if (seen) { off1?.(); return; } // 노드가 지워짐
    const cur = current(), f = fam();
    curName.textContent = cur ? `● ${FAM_PFX[store.type(cur)] || "?"} · ${cur}` : "세트 저장 안 됨";
    curName.style.color = cur ? T.text : T.dim;
    curName.title = (cur ? `지금 LoRA 목록 = 세트 '${cur}'` + (store.model(cur) ? `\n저장할 때 모델: ${modelShort(store.model(cur))}` : "") : "지금 LoRA 목록과 같은 세트가 없습니다") + "\n저장 위치: " + (store.data.folder || "?");
    saveB.style.borderColor = st.saving ? T.accent2 : T.line;
    saveRow.innerHTML = "";
    saveRow.style.display = st.saving ? "flex" : "none";
    if (st.saving) {
      const pf = h("span", { color: T.gold, fontWeight: "700", fontSize: "11px", flexShrink: "0" }, FAM_PFX[f] || "?");
      pf.title = `${FAM_NAME[f] || "?"}용 세트로 저장됩니다`;
      const inp = h("input", { ...INP, flex: "1", fontSize: "12px", padding: "2px 5px" }); noKeys(inp); inp.placeholder = "세트 이름"; inp.value = cur || dateSetName(Object.keys(store.data.sets || {}));
      const ok = async () => {
        const n = inp.value.trim().slice(0, 40); if (!n) return;
        const ot = store.type(n);
        if (store.data.sets?.[n] && ot && ot !== f && !confirm(`'${n}'은(는) ${FAM_NAME[ot]}용 세트입니다. ${FAM_NAME[f]}용으로 덮어쓸까요?`)) return;
        st.saving = false;
        try {
          await store.put(n, getL(), f, opts.saveP ? opts.saveP() : getP ? (getP() || "") : undefined, opts.getModel ? opts.getModel() || "" : undefined);
          // 썸네일: opts.thumbFiles() 가 돌려준 그림(지금 보고 있는 미리보기 등)을 세트에 같이 붙임
          const tf = opts.thumbFiles?.() || [];
          let withImg = false;
          if (tf.length) { try { await store.images(n, tf); withImg = true; } catch (e2) { say("세트는 저장했지만 썸네일을 붙이지 못했습니다: " + e2.message, "warn"); } }
          say(`세트 '${n}' 저장` + (withImg ? " (썸네일 포함)" : ""), "success");
        } catch (er) { say("세트를 저장하지 못했습니다: " + er.message, "error"); render(); }
      };
      inp.addEventListener("keydown", (e) => { if (e.isComposing) return; if (e.key === "Enter") ok(); if (e.key === "Escape") { st.saving = false; render(); } });
      const b1 = chip("저장", "", ok), b2 = chip("취소", "", () => { st.saving = false; render(); });
      Object.assign(b1.style, { background: T.accent, borderColor: T.accent2, color: "#fff" });
      saveRow.append(pf, inp, b1, b2);
      setTimeout(() => inp.focus(), 0);
    }
    if (pBox && document.activeElement !== pBox) pBox.value = getP() || "";
    if (pBox) {
      const on = opts.promptOn ? opts.promptOn.get() !== false : true;
      if (pCb) pCb.checked = on;
      pBox.style.opacity = on ? "1" : ".4";
    }
    hint();
  }
  off1 = store.on(render);
  if (!store.loaded) store.load();
  return { name: curName, head: [pickB, saveB], body, render, current };
}

// ---------- LoRA 고르기 창 썸네일 크기 (두 팩이 같이 기억) ----------
export const THUMB_SIZES = [["작게", 110], ["보통", 150], ["크게", 200], ["아주 크게", 260]];
const TKEY = "cofoty5_lora_thumb";
export function thumbIdx() { try { const i = +localStorage.getItem(TKEY); return Number.isInteger(i) && i >= 0 && i < THUMB_SIZES.length ? i : 1; } catch { return 1; } }
export function nextThumb() { const i = (thumbIdx() + 1) % THUMB_SIZES.length; try { localStorage.setItem(TKEY, String(i)); } catch {} return i; }
// 격자: 칸 너비 고정(줄어들지 않음) · 줄 높이도 내용만큼 고정 → 많아지면 스크롤
export function gridStyle(px) {
  return { gridTemplateColumns: `repeat(auto-fill, ${px}px)`, gridAutoRows: "max-content", justifyContent: "start" };
}
