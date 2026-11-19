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
export function famOnly() { try { return localStorage.getItem(FKEY) !== "0"; } catch { return true; } }
export function setFamOnly(v) { try { localStorage.setItem(FKEY, v ? "1" : "0"); } catch {} FL.forEach((fn) => { try { fn(v); } catch {} }); }
export function onFamOnly(fn) { FL.add(fn); return () => FL.delete(fn); }

// ---------- 세트 저장소 (팩마다 하나: prefix = "/model_loader" · "/cofoty5_onenode") ----------
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
    async put(name, loras, type, prompt) { return S._set(await S._post("/set", { op: "put", name, loras, type, prompt })); },
    async del(name) { return S._set(await S._post("/set", { op: "del", name })); },
    async rename(name, to) { return S._set(await S._post("/set", { op: "rename", name, to })); },
    async setFolder(folder) { return S._set(await S._post("/folder", { folder })); },
    async pick(start) { return (await S._post("/pick", { start: start || "" })).path; },
    // 세트 목록: 지금 계열(fam)과 맞는 것 / 다른 것 (only=false면 전부 '맞는 것')
    names(fam, only = famOnly()) {
      const all = Object.keys(S.data.sets || {}).sort((a, b) => a.localeCompare(b, "ko"));
      const ok = (k) => !only || !fam || !S.data.types?.[k] || S.data.types[k] === fam;
      return { mine: all.filter(ok), other: all.filter((k) => !ok(k)) };
    },
    type(k) { return S.data.types?.[k] || ""; },
    prompt(k) { return S.data.prompts?.[k] || ""; },
    loras(k) { return (S.data.sets?.[k] || []).map((x) => ({ ...x })); },
  };
  STORES.set(prefix, S);
  return S;
}
export const setSig = (arr) => JSON.stringify((arr || []).map((x) => [x.name, +(+x.strength).toFixed(2), x.on !== false]));

// ---------- 저장 위치 창 ----------
export function openStoreFolder(store, { toast } = {}) {
  const C = { text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", line: "#3a3a42", accent: "#2c8a8a", accent2: "#45b0b0", warn: "#e0a040" };
  const h = (tag, s = {}, t) => { const e = document.createElement(tag); Object.assign(e.style, s); if (t != null) e.textContent = t; return e; };
  const btn = (t, fn, s = {}) => { const b = h("button", { background: "#2a2a30", color: C.text, border: `1px solid ${C.line}`, borderRadius: "5px",
    padding: "4px 10px", cursor: "pointer", fontSize: "12px", ...s }, t); b.onclick = fn; return b; };
  const back = h("div", { position: "fixed", inset: "0", background: "rgba(0,0,0,.55)", zIndex: "10002", display: "flex", alignItems: "center", justifyContent: "center" });
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

// ---------- 세트 줄 (세 노드 공용 부품) ----------
//  opts: store, theme, getL()/setL(arr), getFam() → "anima"|"xl"|"sd15", getP()/setP(text) (로라 프롬프트, 없으면 칸 없음), toast
//  돌려줌: { head: [select, 저장, 삭제, 폴더, 필터], body: (저장 줄 + 로라 프롬프트 칸), render() }
export function setBar(opts) {
  const { store, getL, setL, getFam, getP, setP, toast } = opts;
  const T = { text: "#e6e6e6", dim: "#9a9aa4", bg: "#1b1b1f", line: "#3a3a42", accent: "#2c8a8a", accent2: "#45b0b0", gold: "#e8c46a", warn: "#e0a040", ...(opts.theme || {}) };
  const h = (tag, s = {}, t) => { const e = document.createElement(tag); Object.assign(e.style, s); if (t != null) e.textContent = t; return e; };
  const noKeys = (el) => ["keydown", "keyup", "keypress"].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
  const INP = { background: T.bg, color: T.text, border: `1px solid ${T.line}`, borderRadius: "4px", padding: "1px 4px", fontSize: "11px", boxSizing: "border-box", outline: "none", minWidth: "0" };
  const chip = (t, title, fn) => { const b = h("span", { border: `1px solid ${T.line}`, borderRadius: "8px", padding: "0 5px", cursor: "pointer", userSelect: "none",
    fontSize: "11px", display: "inline-flex", alignItems: "center", lineHeight: "17px", background: T.bg, color: T.text, flexShrink: "0" }, t);
    b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(e); }; return b; };
  const say = (m, s) => { if (toast) toast(m, s); };
  const st = { saving: false, delArm: null, delT: 0 };

  const sel = h("select", { ...INP, maxWidth: "128px", padding: "0 2px" });
  noKeys(sel);
  const saveB = chip("저장", "지금 LoRA 조합(과 로라 프롬프트)을 세트로 저장", () => { st.saving = !st.saving; render(); });
  const delB = chip("삭제", "이 세트 삭제 (한 번 더 눌러야 지워짐)", () => {});
  const dirB = chip("폴더", "저장 위치 (세트 · 사전을 다른 노드와 같이 쓰기 / 따로 쓰기)", () => openStoreFolder(store, { toast }));
  const famB = chip("필터", "", () => setFamOnly(!famOnly()));
  const saveRow = h("div", { display: "none", alignItems: "center", gap: "3px" });
  const body = h("div", { display: "flex", flexDirection: "column", gap: "3px" });
  body.append(saveRow);

  let pBox = null, pHint = null;
  if (getP && setP) {
    const wrap = h("div", { display: "flex", flexDirection: "column", gap: "1px" });
    const lab = h("div", { display: "flex", alignItems: "center", gap: "4px", fontSize: "10px", color: T.dim });
    pHint = h("span", { color: T.warn, fontSize: "10px" });
    lab.append(h("span", {}, "로라 프롬프트"), h("span", { flex: "1" }), pHint);
    lab.title = "작가 태그 등. 실행할 때 품질 바로 뒤(캐릭터 앞)에 그대로 들어갑니다. 세트를 저장하면 같이 저장됩니다.";
    pBox = h("textarea", { ...INP, width: "100%", minHeight: "34px", height: "34px", resize: "vertical", padding: "2px 5px", fontFamily: "inherit", lineHeight: "1.35" });
    pBox.placeholder = "작가 태그 등 (예: @wanke, (@tiv:1.06)) — 품질 뒤에 들어감";
    noKeys(pBox);
    pBox.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    pBox.oninput = () => { setP(pBox.value); hint(); };
    wrap.append(lab, pBox);
    body.append(wrap);
  }

  const fam = () => getFam() || "";
  const current = () => {
    const sig = setSig(getL()), f = fam(), only = famOnly();
    return store.names(f, only).mine.find((k) => setSig(store.data.sets[k]) === sig) || "";
  };
  function hint() {
    if (!pHint) return;
    const cur = current();
    pHint.textContent = cur && (getP() || "") !== store.prompt(cur) ? "세트와 다름 (저장 버튼으로 저장)" : "";
  }
  let seen = false, off1 = null, off2 = null;
  function render() {
    if (sel.isConnected) seen = true;
    else if (seen) { off1?.(); off2?.(); return; } // 노드가 지워짐
    const cur = current(), f = fam(), only = famOnly();
    const { mine, other } = store.names(f, only);
    sel.innerHTML = "";
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = cur ? "세트…" : "세트 (저장 안 됨)"; sel.append(o0);
    const lab = (k) => `${FAM_PFX[store.type(k)] || "?"} · ${k}`;
    mine.forEach((k) => { const o = document.createElement("option"); o.value = k; o.textContent = (k === cur ? "● " : "") + lab(k); sel.append(o); });
    if (other.length) {
      const g = document.createElement("optgroup"); g.label = "다른 모델용 (필터를 끄면 고를 수 있음)";
      other.forEach((k) => { const o = document.createElement("option"); o.value = k; o.disabled = true; o.textContent = lab(k); g.append(o); });
      sel.append(g);
    }
    sel.value = cur;
    sel.title = (cur ? `현재 세트: ${lab(cur)}\n` : "세트를 고르면 LoRA 목록과 로라 프롬프트가 그 세트로 바뀝니다\n") +
      "앞 글자: An = Anima용 · IL = SDXL·IL용 · 15 = SD1.5용 · ? = 모름\n저장 위치: " + (store.data.folder || "?");
    delB.style.display = cur ? "inline-flex" : "none";
    // 삭제: 첫 클릭은 "정말 삭제?"로 바뀌기만 함 (4초 안에 한 번 더 눌러야 지워짐, 다른 세트로 바뀌면 취소)
    if (st.delArm && st.delArm !== cur) { clearTimeout(st.delT); st.delArm = null; }
    const armed = !!cur && st.delArm === cur;
    delB.textContent = armed ? `'${cur.length > 12 ? cur.slice(0, 12) + "…" : cur}' 정말 삭제?` : "삭제";
    Object.assign(delB.style, armed ? { background: "#8a2c2c", borderColor: "#d06060", color: "#fff" } : { background: T.bg, borderColor: T.line, color: T.text });
    delB.title = armed ? `세트 '${cur}'을(를) 지웁니다. 한 번 더 누르면 삭제 (4초 지나면 취소)` : "이 세트 삭제 (한 번 더 눌러야 지워짐)";
    delB.onclick = async (e) => {
      e.stopPropagation();
      if (st.delArm !== cur) {
        st.delArm = cur; clearTimeout(st.delT);
        st.delT = setTimeout(() => { st.delArm = null; render(); }, 4000);
        render(); return;
      }
      clearTimeout(st.delT); st.delArm = null;
      try { await store.del(cur); say(`세트 '${cur}' 삭제`, "info"); } catch (er) { say(er.message, "error"); render(); }
    };
    saveB.style.borderColor = st.saving ? T.accent2 : T.line;
    Object.assign(famB.style, only ? { background: T.accent, borderColor: T.accent2, color: "#fff" } : { background: T.bg, borderColor: T.line, color: T.dim });
    famB.title = only ? `지금 모델용만 보기: 켬 (${FAM_NAME[f] || f})\nLoRA 고르기 창과 세트 목록에 같이 적용됩니다. 누르면 제한 없이 보기` : "지금 모델용만 보기: 끔 (모든 LoRA · 세트를 고를 수 있음). 누르면 켬";
    dirB.style.borderColor = store.data.is_default ? T.line : T.gold;
    saveRow.innerHTML = "";
    saveRow.style.display = st.saving ? "flex" : "none";
    if (st.saving) {
      const pf = h("span", { color: T.gold, fontWeight: "700", fontSize: "11px", flexShrink: "0" }, FAM_PFX[f] || "?");
      pf.title = `${FAM_NAME[f] || "?"}용 세트로 저장됩니다`;
      const inp = h("input", { ...INP, flex: "1", fontSize: "12px", padding: "2px 5px" }); noKeys(inp); inp.placeholder = "세트 이름"; inp.value = cur || "";
      const ok = async () => {
        const n = inp.value.trim().slice(0, 40); if (!n) return;
        const ot = store.type(n);
        if (store.data.sets?.[n] && ot && ot !== f && !confirm(`'${n}'은(는) ${FAM_NAME[ot]}용 세트입니다. ${FAM_NAME[f]}용으로 덮어쓸까요?`)) return;
        st.saving = false;
        try { await store.put(n, getL(), f, getP ? (getP() || "") : undefined); say(`세트 '${n}' 저장`, "success"); } catch (er) { say("세트를 저장하지 못했습니다: " + er.message, "error"); render(); }
      };
      inp.addEventListener("keydown", (e) => { if (e.isComposing) return; if (e.key === "Enter") ok(); if (e.key === "Escape") { st.saving = false; render(); } });
      const b1 = chip("저장", "", ok), b2 = chip("취소", "", () => { st.saving = false; render(); });
      Object.assign(b1.style, { background: T.accent, borderColor: T.accent2, color: "#fff" });
      saveRow.append(pf, inp, b1, b2);
      setTimeout(() => inp.focus(), 0);
    }
    if (pBox && document.activeElement !== pBox) pBox.value = getP() || "";
    hint();
  }
  sel.onchange = () => {
    const k = sel.value;
    if (k && store.data.sets?.[k]) { setL(store.loras(k)); if (setP) setP(store.prompt(k)); }
    render();
  };
  off1 = store.on(render);
  off2 = onFamOnly(render);
  if (!store.loaded) store.load();
  return { head: [sel, saveB, delB, dirB, famB], body, render, select: sel, current };
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
