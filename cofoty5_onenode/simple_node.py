"""
cofoty5_onenode - CoFoTy5 OneNode ® (simple_node.py)

노드 하나로: 생성(미리보기 여러 장) → 고른 한 장을 [업스케일 저장] 또는 [그대로 저장]
- 모델: Anima(diffusion_models + 인코더 + VAE) 또는 체크포인트(checkpoints — Illustrious·NoobAI 등 SDXL 계열) 중 하나
- 손·얼굴 보정: ComfyUI-Impact-Pack + ComfyUI-Impact-Subpack(감지 노드)이 깔려 있으면 켜고 끌 수 있음 (설치된 것을 불러 씀)
- LoRA: 화면의 LoRA 목록(미리보기 이미지 · 세트 저장 · 키워드). 프롬프트 안의 <lora:파일이름:0.8> 도 함께 적용
- 저장 PNG: ComfyUI 워크플로 + WebUI 형식 설정 글(parameters)을 함께 넣음

동작 방식
- 화면의 버튼이 숨은 칸 action(generate / upscale / save)과 pick(고른 번호)을 정하고 실행을 겁니다.
- 생성 결과는 이 노드 전용 기억 칸에 남겨 두었다가, 업스케일·저장할 때 꺼내 씁니다 (다시 생성하지 않음).
- ④ 목록으로 연속 생성: 숨은 칸 auto에 지금 항목(태그 · 이름)을 넣어 실행. action=auto 는 생성 → 배치 전부 저장(또는 업스케일 저장)까지 한 번에.
"""

import json
import os
import random
import re
import shutil
import time

import numpy as np
import torch
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import comfy.model_management
import comfy.samplers
import comfy.sd
import comfy.utils
import folder_paths
import nodes
from aiohttp import web
from server import PromptServer

from . import accel
from .lora_info import LoraLibrary
from .lora_paths import resolve_lora
from .oscmd import open_folder

CAT = "cofoty5_onenode"
TYPE = "CoFoTy5_OneNode"
OUT_SUB = "onenode"
LOG = "[OneNode]"

QUALITY_DEFAULT = "(masterpiece:1.25), (best quality:1.25), (ultra detailed:1.2), (absurdres:1.15), (very aesthetic:1.1)"
NEGATIVE_DEFAULT = (
    "bad quality,worst quality,worst detail,sketch,censor,low quality, worst quality, bad anatomy, bad hands, text, error, blurry, extra digit, fewer digits, cropped, ugly, displaced eyes, makeup, color bleeding, intertwined, merged clothing, mixed features")
EXTRA_DEFAULT = (
    "[Background & Action] cozy living room, sitting together on a plush sofa, viewed from behind-right, retro-style CRT television on a wooden stand in front of the sofa, TV screen glowing and showing a program, warm lamplight, cinematic lighting, dramatic angle")
POSITIVE_DEFAULT = (
    "1girl, young female, white bob hair, brown eyes, wearing round glasses, wearing white frilled maid headband, wearing a dark blue and brown steampunk-style maid outfit with extensive gear and leather details, a brown leather corset over a white blouse with gold buttons, a white ruffled apron, sitting on a plush sofa, turning her body back to look at the viewer, direct gaze, smiling, inviting gesture with her left hand, inviting the camera to join, a retro-style CRT television on a wooden stand in front of the sofa, TV screen is glowing and showing a program, a small chibi-style version of her with glasses hovers over her right shoulder, cozy living room background, bookshelves, alchemical potion bottles on shelves, warm lamplight, cinematic lighting, dramatic angle")


# ---------------------------------------------------------------- 목록 · 파일 찾기
def _list(kind, fallback=None):
    try:
        return folder_paths.get_filename_list(kind)
    except Exception:
        try:
            return folder_paths.get_filename_list(fallback) if fallback else []
        except Exception:
            return []


def _full(kind, name):
    try:
        if hasattr(folder_paths, "get_full_path_or_raise"):
            return folder_paths.get_full_path_or_raise(kind, name)
        return folder_paths.get_full_path(kind, name)
    except Exception:
        return None


def _pick(lst, *words):
    for w in words:
        for x in lst:
            if w in os.path.basename(x).lower():
                return x
    return lst[0] if lst else ""


def _samplers():
    return comfy.samplers.KSampler.SAMPLERS


def _schedulers():
    return comfy.samplers.KSampler.SCHEDULERS


def _ok(v, lst, default):
    return v if v in lst else (default if default in lst else lst[0])


# ---------------------------------------------------------------- 모델 불러오기 (기억해 두고 다시 씀)
_UNET = {"key": None, "obj": None}
_CLIP = {"key": None, "obj": None}
_VAE = {"key": None, "obj": None}
_LORA = {}


def _key(path):
    return (path, os.path.getmtime(path))


def _need(kind, name, label):
    path = _full(kind, name)
    if not path:
        raise FileNotFoundError(f"{label} 파일을 찾을 수 없습니다: {name}  (models 폴더를 확인해 주세요)")
    return path


def _load_unet(name):
    k = _key(_need("diffusion_models", name, "모델"))
    if _UNET["key"] != k:
        _UNET.update(key=None, obj=None)
        _UNET.update(key=k, obj=comfy.sd.load_diffusion_model(k[0], model_options={}))
    return _UNET["obj"]


def _load_clip(name):
    k = _key(_need("text_encoders", name, "텍스트 인코더"))
    if _CLIP["key"] != k:
        clip = comfy.sd.load_clip(ckpt_paths=[k[0]], embedding_directory=folder_paths.get_folder_paths("embeddings"),
                                  clip_type=comfy.sd.CLIPType.STABLE_DIFFUSION)
        _CLIP.update(key=k, obj=clip)
    return _CLIP["obj"]


def _load_vae(name):
    k = _key(_need("vae", name, "VAE"))
    if _VAE["key"] != k:
        try:
            sd, meta = comfy.utils.load_torch_file(k[0], return_metadata=True)
            vae = comfy.sd.VAE(sd=sd, metadata=meta)
        except TypeError:  # 옛 ComfyUI
            vae = comfy.sd.VAE(sd=comfy.utils.load_torch_file(k[0]))
        if hasattr(vae, "throw_exception_if_invalid"):
            vae.throw_exception_if_invalid()
        _VAE.update(key=k, obj=vae)
    return _VAE["obj"]


def _release_anima():
    for c in (_UNET, _CLIP, _VAE):
        c.update(key=None, obj=None)


_CKPT = {"key": None, "obj": None}


def _load_ckpt(name):
    """체크포인트 하나에 모델 · 텍스트 인코더(CLIP) · VAE가 함께 들어 있음 (Illustrious · NoobAI 등)"""
    k = _key(_need("checkpoints", name, "체크포인트"))
    if _CKPT["key"] != k:
        _CKPT.update(key=None, obj=None)
        out = comfy.sd.load_checkpoint_guess_config(k[0], output_vae=True, output_clip=True,
                                                    embedding_directory=folder_paths.get_folder_paths("embeddings"))
        if out[1] is None:
            raise RuntimeError(f"이 체크포인트에는 텍스트 인코더가 들어 있지 않습니다: {name}")
        _CKPT.update(key=k, obj=(out[0], out[1], out[2]))
    return _CKPT["obj"]


def load_base(model_type, model, text_encoder, vae, ckpt, clip_skip):
    """→ (모델, CLIP, VAE, 실제 쓴 모델 이름). 다른 종류를 쓰면 이전 것은 메모리에서 내림"""
    if model_type == "ckpt":
        _release_anima()
        m, c, v = _load_ckpt(ckpt)
        cs = max(1, int(clip_skip or 1))
        if cs > 1:
            c = c.clone()
            c.clip_layer(-cs)
        return m, c, v, ckpt
    _CKPT.update(key=None, obj=None)
    return _load_unet(model), _load_clip(text_encoder), _load_vae(vae), model


_FAM = {}


def _st_header(path):
    try:
        with open(path, "rb") as f:
            n = int.from_bytes(f.read(8), "little")
            if n <= 0 or n > 128 * 1024 * 1024:
                return {}
            return json.loads(f.read(n).decode("utf-8", errors="replace"))
    except Exception:
        return {}


def ckpt_family(name):
    """체크포인트 계열 짐작 (파일을 불러오지 않고 머리말만 읽음) → {"arch": SDXL/SD1.5/..., "label": 화면 표시}"""
    path = _full("checkpoints", name)
    if not path:
        return {"arch": "", "label": ""}
    k = _key(path)
    if k in _FAM:
        return _FAM[k]
    arch = ""
    if path.lower().endswith(".safetensors"):
        hd = _st_header(path)
        keys = [x for x in hd if x != "__metadata__"]
        meta = hd.get("__metadata__") or {}
        if any(x.startswith("conditioner.embedders.1.") for x in keys):
            arch = "SDXL"
        elif any(x.startswith("cond_stage_model.") for x in keys):
            arch = "SD1.5"
        elif any("joint_blocks" in x for x in keys):
            arch = "SD3"
        elif any("double_blocks" in x for x in keys):
            arch = "Flux"
        hint = " ".join(str(meta.get(x, "")) for x in ("modelspec.architecture", "modelspec.title", "ss_base_model_version"))
    else:
        hint = ""
    hint = (hint + " " + os.path.basename(name)).lower()
    label = arch
    for w, lab in (("illustrious", "Illustrious"), ("illu", "Illustrious"), ("noob", "NoobAI"), ("pony", "Pony")):
        if w in hint:
            label, arch = lab, arch or "SDXL"
            break
    if not arch and ("xl" in hint):
        arch = label = "SDXL"
    _FAM[k] = {"arch": arch, "label": label}
    return _FAM[k]


def parse_toggles(raw):
    """구도 버튼으로 켠 태그 목록(JSON)"""
    try:
        v = json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    return [str(x).strip() for x in v if str(x).strip()] if isinstance(v, list) else []


def parse_auto(raw):
    """④ 목록으로 연속 생성의 지금 항목. 비어 있으면 {}"""
    try:
        d = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    if not isinstance(d, dict):
        return {}
    mode = d.get("mode") if d.get("mode") in ("save", "upscale", "watch") else "save"
    return {"tags": str(d.get("tags") or "").strip(), "label": str(d.get("label") or "").strip(), "mode": mode,
            "i": int(d.get("i") or 0), "n": int(d.get("n") or 0), "key": str(d.get("key") or "")[:300]}


def _join(*parts):
    return ", ".join(p.strip().strip(",").strip() for p in parts if p and p.strip().strip(",").strip())


# ---------------------------------------------------------------- LoRA (<lora:이름:세기>)
LORA_RE = re.compile(r"<\s*lora\s*:\s*([^:>]+?)\s*(?::\s*(-?[\d.]+)\s*)?(?::\s*-?[\d.]+\s*)?>", re.I)


def split_loras(text):
    """프롬프트에서 <lora:..> 를 꺼내고, 남은 프롬프트를 돌려줌"""
    found = [(m.group(1).strip(), float(m.group(2)) if m.group(2) else 1.0) for m in LORA_RE.finditer(text or "")]
    rest = LORA_RE.sub("", text or "")
    rest = re.sub(r"\s*,\s*(,\s*)+", ", ", rest).strip().strip(",").strip()
    return rest, found


def _find_lora(name):
    files = _list("loras")
    low = name.replace("\\", "/").lower()
    for f in files:  # 정확히 같은 경로
        if f.replace("\\", "/").lower() in (low, low + ".safetensors"):
            return f
    stem = os.path.splitext(os.path.basename(low))[0]
    for f in files:  # 파일 이름만 같아도
        if os.path.splitext(os.path.basename(f.replace("\\", "/")))[0].lower() == stem:
            return f
    return None


def parse_list(raw):
    """화면 LoRA 목록(JSON) → [(이름, 세기)] (꺼진 것·세기 0 제외)"""
    try:
        v = json.loads(raw or "[]")
    except (json.JSONDecodeError, TypeError):
        return []
    out = []
    for x in v if isinstance(v, list) else []:
        if isinstance(x, dict) and x.get("name") and x.get("on", True):
            try:
                st = float(x.get("strength", 1))
            except (TypeError, ValueError):
                st = 1.0
            if st != 0:
                out.append((str(x["name"]), st))
    return out


def apply_loras(model, clip, loras):
    used, missing = [], []
    for name, s in loras:
        if s == 0:
            continue
        f = name if _full("loras", name) else (_find_lora(name) or resolve_lora(name))
        if not f or not _full("loras", f):
            missing.append(name)
            continue
        path = _full("loras", f)
        k = _key(path)
        if k not in _LORA:
            if len(_LORA) > 16:
                _LORA.clear()
            _LORA[k] = comfy.utils.load_torch_file(path, safe_load=True)
        model, clip = comfy.sd.load_lora_for_models(model, clip, _LORA[k], s, s)
        used.append(f"{os.path.splitext(os.path.basename(f))[0]}:{s:g}")
    return model, clip, used, missing


# ---------------------------------------------------------------- 인코딩 · 디코딩
def _encode(clip, text):
    tokens = clip.tokenize(text)
    if hasattr(clip, "encode_from_tokens_scheduled"):
        return clip.encode_from_tokens_scheduled(tokens)
    cond, pooled = clip.encode_from_tokens(tokens, return_pooled=True)
    return [[cond, {"pooled_output": pooled}]]


def _decode(vae, samples):
    img = vae.decode(samples)
    if img.dim() == 5:  # 영상형 VAE: [b, t, h, w, c] → [b*t, h, w, c]
        img = img.reshape(-1, img.shape[-3], img.shape[-2], img.shape[-1])
    return img


def _encode_each(vae, pixels):
    """Anima VAE는 여러 장을 한 번에 넣으면 1장으로 묶어버려서 한 장씩 인코딩"""
    outs = [vae.encode(pixels[i:i + 1, :, :, :3]) for i in range(pixels.shape[0])]
    return {"samples": torch.cat(outs, dim=0)}


def _scale16(image, scale):
    _, h, w, _ = image.shape
    nw = max(16, int(round(w * scale / 16.0)) * 16)
    nh = max(16, int(round(h * scale / 16.0)) * 16)
    out = comfy.utils.common_upscale(image.movedim(-1, 1), nw, nh, "lanczos", "disabled")
    return out.movedim(1, -1).clamp(0, 1)


def _sample(model, seed, steps, cfg, sa, sc, pos, neg, latent, denoise):
    model = accel.patch(model)   # 가속이 켜져 있으면 Sage를 쓰는 복제본 (아니면 그대로)
    with accel.fp16_ctx():
        out = nodes.common_ksampler(model, seed, steps, cfg, sa, sc, pos, neg, latent, denoise=denoise)[0]
    accel.after_sample()
    return out


# ---------------------------------------------------------------- 손·얼굴 보정 (Impact Pack)
DETAIL = {
    "face": {"words": ("face",), "default": "bbox/face_yolov8m.pt",
             "set": dict(bbox_threshold=0.5, bbox_dilation=10, bbox_crop_factor=3.0)},
    "hand": {"words": ("hand",), "default": "bbox/hand_yolov8s.pt",
             "set": dict(bbox_threshold=0.35, bbox_dilation=15, bbox_crop_factor=2.5)},
}
_DET = {}


def impact_status():
    """Impact Pack이 있는지, 얼굴·손 감지 모델이 있는지"""
    M = nodes.NODE_CLASS_MAPPINGS
    if "FaceDetailer" not in M or "UltralyticsDetectorProvider" not in M:
        return {"ok": False, "face": None, "hand": None, "msg": "ComfyUI-Impact-Pack과 ComfyUI-Impact-Subpack이 있어야 손·얼굴 보정을 쓸 수 있습니다."}
    try:
        names = M["UltralyticsDetectorProvider"].INPUT_TYPES()["required"]["model_name"][0]
    except Exception:
        names = []
    pick = {}
    for k, d in DETAIL.items():
        cands = [n for n in names if n.startswith("bbox/") and any(w in n.lower() for w in d["words"])]
        pick[k] = d["default"] if d["default"] in cands else (cands[0] if cands else None)
    msg = "" if all(pick.values()) else "감지 모델이 없습니다: " + ", ".join(
        f"models/ultralytics/{DETAIL[k]['default']}" for k, v in pick.items() if not v)
    return {"ok": True, **pick, "msg": msg}


def _defaults(cls):
    """노드의 입력 기본값을 모아 둠 (Impact Pack 버전이 달라도 이름으로 맞춰 넣기 위해)"""
    out = {}
    spec = cls.INPUT_TYPES()
    for sec in ("required", "optional"):
        for k, v in (spec.get(sec) or {}).items():
            if not isinstance(v, (list, tuple)) or not v:
                continue
            opts = v[1] if len(v) > 1 and isinstance(v[1], dict) else {}
            if "default" in opts:
                out[k] = opts["default"]
            elif isinstance(v[0], (list, tuple)) and v[0]:
                out[k] = v[0][0]
    return out


def run_detail(kind, image, model, clip, vae, pos, neg, seed, steps, cfg, sa, sc, denoise, guide=768):
    st = impact_status()
    if not st["ok"] or not st.get(kind):
        print(f"{LOG} {kind} 보정 건너뜀 — {st['msg']}")
        return image, False
    M = nodes.NODE_CLASS_MAPPINGS
    FD, DP = M["FaceDetailer"], M["UltralyticsDetectorProvider"]
    name = st[kind]
    if name not in _DET:
        _DET[name] = getattr(DP(), DP.FUNCTION)(model_name=name)[0]
    kw = _defaults(FD)
    kw.update(image=image, model=model, clip=clip, vae=vae, positive=pos, negative=neg, bbox_detector=_DET[name],
              guide_size=guide, guide_size_for=True, max_size=1024, seed=seed, steps=steps, cfg=cfg,
              sampler_name=sa, scheduler=sc, denoise=denoise, feather=5, noise_mask=True, force_inpaint=True,
              drop_size=10, wildcard="", cycle=1)
    kw.update(DETAIL[kind]["set"])
    spec = FD.INPUT_TYPES()
    allowed = set((spec.get("required") or {}).keys()) | set((spec.get("optional") or {}).keys())
    kw = {k: v for k, v in kw.items() if k in allowed}
    kw["model"] = accel.patch(kw.get("model"))
    with accel.fp16_ctx():
        out = getattr(FD(), FD.FUNCTION)(**kw)
    return out[0], True


# ---------------------------------------------------------------- 저장
def _save_png(img, folder, prefix, meta_text, prompt=None, extra=None, compress=4, numbered=True):
    os.makedirs(folder, exist_ok=True)
    arr = np.clip(255.0 * img.cpu().numpy(), 0, 255).astype(np.uint8)
    pil = Image.fromarray(arr)
    info = PngInfo()
    if meta_text:
        info.add_text("parameters", meta_text)
    if prompt is not None:
        info.add_text("prompt", json.dumps(prompt))
    for k, v in (extra or {}).items():
        info.add_text(k, json.dumps(v))
    existing = set(os.listdir(folder))
    if numbered:
        n = 1
        sep = "_" if prefix else ""
        while f"{prefix}{sep}{n:04d}.png" in existing:
            n += 1
        fname = f"{prefix}{sep}{n:04d}.png"
    else:
        fname, k = f"{prefix}.png", 2
        while fname in existing:
            fname, k = f"{prefix}({k}).png", k + 1
    pil.save(os.path.join(folder, fname), pnginfo=info, compress_level=compress)
    return fname


def _params_text(pos, neg, steps, cfg, sa, sc, seed, w, h, model, loras, extra="", clip_skip=1):
    lora_txt = "".join(f" <lora:{os.path.splitext(os.path.basename(str(n).replace(chr(92), '/')))[0]}:{s:g}>" for n, s in loras)
    return (f"{pos}{lora_txt}\nNegative prompt: {neg}\n"
            f"Steps: {steps}, Sampler: {sa}, Schedule type: {sc}, CFG scale: {cfg:g}, Seed: {seed}, "
            f"Size: {w}x{h}, Model: {os.path.splitext(os.path.basename(model))[0]}"
            f"{f', Clip skip: {clip_skip}' if clip_skip > 1 else ''}{extra}")


# ---------------------------------------------------------------- 저장 위치 규칙
NAME_RULES = ["날짜_번호", "날짜_시드", "번호만"]


def safe_name(x):
    x = re.sub(r'[\\/:*?"<>|\r\n\t]+', "_", str(x or "")).strip(" ._")
    return x[:80]


def save_dir(folder, date_folder):
    """output 안의 저장 폴더 (.. 금지). 날짜별 폴더를 켜면 그 아래 오늘 날짜"""
    parts = [safe_name(p) for p in re.split(r"[\\/]+", folder or "") if safe_name(p) and p not in (".", "..")]
    if date_folder:
        parts.append(time.strftime("%Y%m%d"))
    rel = "/".join(parts)
    return os.path.join(folder_paths.get_output_directory(), *parts), rel


def file_stem(rule, seed):
    rule = rule if rule in NAME_RULES else NAME_RULES[0]
    if rule == "날짜_시드":
        return f"{time.strftime('%Y%m%d')}_{seed}", False
    if rule == "번호만":
        return "", True
    return time.strftime("%Y%m%d"), True


def _load_output(rel):
    """output 폴더 안의 저장본을 이미지로 읽음 (output 밖은 거부)"""
    root = os.path.abspath(folder_paths.get_output_directory())
    path = os.path.abspath(os.path.join(root, *[p for p in re.split(r"[\\/]+", rel or "") if p not in ("", ".", "..")]))
    if not path.startswith(root + os.sep) or not os.path.isfile(path):
        raise FileNotFoundError(f"저장본을 찾을 수 없습니다: {rel} (옮기거나 지웠다면 미리보기에서 다시 고르세요)")
    pil = Image.open(path).convert("RGB")
    return torch.from_numpy(np.asarray(pil).astype(np.float32) / 255.0)[None, ...]


# ---------------------------------------------------------------- 노드
_CACHE = {}  # 노드 id → 마지막 생성 결과


class CoFoTy5OneNode:
    @classmethod
    def INPUT_TYPES(cls):
        units = _list("diffusion_models", "unet")
        tes = _list("text_encoders", "clip")
        vaes = _list("vae")
        cks = _list("checkpoints")
        SA, SC = _samplers(), _schedulers()
        return {
            "required": {
                "positive": ("STRING", {"multiline": True, "default": POSITIVE_DEFAULT}),
                "negative": ("STRING", {"multiline": True, "default": NEGATIVE_DEFAULT}),
                "width": ("INT", {"default": 864, "min": 256, "max": 4096, "step": 16}),
                "height": ("INT", {"default": 1152, "min": 256, "max": 4096, "step": 16}),
                "batch": ("INT", {"default": 1, "min": 1, "max": 16}),
                "loras": ("STRING", {"default": "[]"}),
                "seed_value": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),  # seed 이름이면 화면이 자동 칸을 붙여서 피함
                "random_seed": ("BOOLEAN", {"default": True}),
                # 모델 · 인코더 · VAE · 체크포인트는 목록 대신 글자 칸: 파일이 없어도 워크플로가 열리고, 없을 때 알아보기 쉬운 안내
                "model": ("STRING", {"default": _pick(units, "turbo", "anima")}),
                "steps": ("INT", {"default": 12, "min": 1, "max": 150}),
                "cfg": ("FLOAT", {"default": 1.5, "min": 0.0, "max": 30.0, "step": 0.1, "round": 0.01}),
                "sampler": (SA, {"default": _ok("er_sde", SA, "euler")}),
                "scheduler": (SC, {"default": _ok("beta57", SC, "simple")}),
                "text_encoder": ("STRING", {"default": _pick(tes, "qwen_3", "qwen")}),
                "vae": ("STRING", {"default": _pick(vaes, "qwen_image", "qwen")}),
                "quality_on": ("BOOLEAN", {"default": True}),
                "quality": ("STRING", {"multiline": False, "default": QUALITY_DEFAULT}),
                "up_scale": ("FLOAT", {"default": 1.25, "min": 1.0, "max": 2.0, "step": 0.05}),
                "up_denoise": ("FLOAT", {"default": 0.35, "min": 0.05, "max": 1.0, "step": 0.05}),
                "up_sampler": (SA, {"default": _ok("er_sde", SA, "euler")}),
                "up_scheduler": (SC, {"default": "simple"}),
                "face_fix": ("BOOLEAN", {"default": False}),
                "hand_fix": ("BOOLEAN", {"default": False}),
                "face_denoise": ("FLOAT", {"default": 0.4, "min": 0.05, "max": 1.0, "step": 0.05}),
                "hand_denoise": ("FLOAT", {"default": 0.45, "min": 0.05, "max": 1.0, "step": 0.05}),
                "save_folder": ("STRING", {"default": OUT_SUB}),
                "save_name": ("STRING", {"default": NAME_RULES[0]}),  # 목록 대신 글자: 예전 워크플로 값이 밀려도 오류 없이 기본 규칙
                "date_folder": ("BOOLEAN", {"default": False}),
                "extra": ("STRING", {"multiline": True, "default": EXTRA_DEFAULT}),  # 배경 · 기타 (본 프롬프트 뒤에 붙음)
                "action": ("STRING", {"default": "generate"}),
                "pick": ("INT", {"default": 0, "min": 0, "max": 63}),
                "src": ("STRING", {"default": ""}),  # 저장본에서 다시 업스케일·저장할 때: output 안 경로
                "model_type": ("STRING", {"default": "anima"}),  # anima / ckpt
                "ckpt": ("STRING", {"default": _pick(cks, "illustrious", "noob", "xl")}),
                "clip_skip": ("INT", {"default": 2, "min": 1, "max": 12}),
                "toggles": ("STRING", {"default": "[]"}),  # 구도 버튼으로 켠 태그 (본 프롬프트 뒤, 배경 앞)
                "auto": ("STRING", {"default": ""}),  # ④ 목록으로 연속 생성: 지금 항목 {"tags","label","mode","i","n"}
                "lora_prompt": ("STRING", {"multiline": True, "default": ""}),  # 로라 프롬프트(작가 태그 등): 품질 바로 뒤에 들어감 · LoRA 세트와 같이 저장
                "lora_prompt_on": ("BOOLEAN", {"default": True}),  # 작가 태그 칸 앞 체크: 끄면 글자는 남기고 생성에만 안 씀
            },
            "hidden": {"unique_id": "UNIQUE_ID", "prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = CAT
    DESCRIPTION = "CoFoTy5 OneNode: Anima 또는 체크포인트(Illustrious 등)로 생성 → 고른 한 장 업스케일 저장 / 그대로 저장. 손·얼굴 보정 켜고 끄기."

    @classmethod
    def IS_CHANGED(cls, **kw):
        return float("nan")  # 버튼마다 항상 실행

    # ---------- 공통 준비 ----------
    def _prepare(self, base, positive, negative, quality_on, quality, lora_json="[]", extra="", toggles="[]", auto_tags="", lora_prompt=""):
        pos_text, tag_loras = split_loras(positive)
        extra_text, extra_loras = split_loras(extra)
        loras = parse_list(lora_json) + tag_loras + extra_loras
        auto_text, auto_loras = split_loras(auto_tags or "")
        loras += auto_loras
        pos_text = _join(pos_text, ", ".join(parse_toggles(toggles)), auto_text, extra_text)
        m, c, v, _ = base
        m, c, used, missing = apply_loras(m, c, loras)
        lp_text, lp_loras = split_loras(lora_prompt or "")
        loras += lp_loras
        # 품질(켰을 때) → 로라 프롬프트(품질을 꺼도 들어감, 중복은 따지지 않음) → 본 프롬프트
        full = _join(quality if quality_on else "", lp_text, pos_text)
        pos = _encode(c, full)
        neg = _encode(c, negative or "")
        return m, c, v, pos, neg, full, loras, used, missing

    def run(self, positive, negative, width, height, batch, loras, seed_value, random_seed, model, steps, cfg, sampler, scheduler,
            text_encoder, vae, quality_on, quality, up_scale, up_denoise, up_sampler, up_scheduler,
            face_fix, hand_fix, face_denoise, hand_denoise, save_folder, save_name, date_folder, extra, action, pick, src="",
            model_type="anima", ckpt="", clip_skip=2, toggles="[]", auto="", lora_prompt="", lora_prompt_on=True, unique_id=None, prompt=None, extra_pnginfo=None):
        SA, SC = _samplers(), _schedulers()
        if not lora_prompt_on:  # 칸 앞 체크를 끄면 작가 태그 칸은 없는 것처럼
            lora_prompt = ""
        sampler, up_sampler = _ok(sampler, SA, "euler"), _ok(up_sampler, SA, "euler")
        scheduler, up_scheduler = _ok(scheduler, SC, "simple"), _ok(up_scheduler, SC, "simple")
        key = str(unique_id)
        action = (action or "generate").strip()
        model_type = "ckpt" if model_type == "ckpt" else "anima"
        cs = int(clip_skip or 1) if model_type == "ckpt" else 1
        base = load_base(model_type, model, text_encoder, vae, ckpt, cs)
        guide = 1024 if model_type == "ckpt" else 768

        item = parse_auto(auto)
        gen = lambda: self._generate(key, base, model_type, cs, positive, negative, width, height, batch, seed_value, random_seed,
                                     steps, cfg, sampler, scheduler, quality_on, quality, loras, extra, toggles, item, lora_prompt)
        sv = dict(base=base, model_type=model_type, cs=cs, guide=guide, loras=loras, steps=steps, cfg=cfg, sampler=sampler,
                  scheduler=scheduler, up_scale=up_scale, up_denoise=up_denoise, up_sampler=up_sampler, up_scheduler=up_scheduler,
                  face_fix=face_fix, hand_fix=hand_fix, face_denoise=face_denoise, hand_denoise=hand_denoise,
                  save_folder=save_folder, save_name=save_name, date_folder=date_folder, quality_on=quality_on, quality=quality,
                  lora_prompt=lora_prompt,
                  random_seed=random_seed, prompt=prompt, extra_pnginfo=extra_pnginfo)

        if action == "generate":
            return gen()

        if action == "auto":  # ④ 목록으로 연속 생성: 생성 → 배치 장수만큼 전부 저장(또는 업스케일 저장)까지 한 번에
            res = gen()
            last = _CACHE[key]
            how = "upscale" if item.get("mode") == "upscale" else "save"
            saved, msg = [], ""
            for i in range(last["images"].shape[0]):
                entry, msg = self._save_one(last, i, last["images"][i:i + 1], "", how, sv)
                saved.append(entry)
            tag = f"[{item.get('i', 0) + 1}/{item.get('n', 0)}] {item.get('label') or '항목'}"
            note = f"자동 {tag} · {len(saved)}장 {'업스케일 ' if how == 'upscale' else ''}저장"
            print(f"{LOG} {note}")
            res["ui"].update({"cofoty5_saved": saved, "cofoty5_msg": [note], "cofoty5_pick": [0],
                              "cofoty5_auto": [{"i": item.get("i", 0), "n": item.get("n", 0), "label": item.get("label", ""), "count": len(saved),
                                                "key": item.get("key", ""), "prompt": last.get("positive_clean", ""), "neg": last.get("negative", ""),
                                                "loras": [f"{os.path.splitext(os.path.basename(str(n).replace(chr(92), '/')))[0]}:{w:g}" for n, w in last.get("loras", [])]}]})
            return res

        # ---------- 고른 한 장: 업스케일 저장 / 그대로 저장 ----------
        last = _CACHE.get(key)
        if not last:
            raise RuntimeError("먼저 [생성]으로 미리보기를 만든 뒤 한 장을 골라 주세요. (재시작하면 미리보기 기억이 지워집니다)")
        if action in ("save_all", "upscale_all"):  # 미리보기 전부 저장 (보면서 진행의 [모두 …저장])
            how = "upscale" if action == "upscale_all" else "save"
            saved, msg = [], ""
            for i in range(last["images"].shape[0]):
                entry, msg = self._save_one(last, i, last["images"][i:i + 1], "", how, sv)
                saved.append(entry)
            note = f"{len(saved)}장 모두 {'업스케일 ' if how == 'upscale' else ''}저장" + (f" · {last['label']}" if last.get("label") else "")
            return {"ui": {"cofoty5_saved": saved, "cofoty5_msg": [note], "cofoty5_pick": [0]}}
        i = max(0, min(int(pick), last["images"].shape[0] - 1))
        img = last["images"][i:i + 1]
        from_file = ""
        if src:  # 고른 것이 저장본이면 그 파일에서 출발 (업스케일한 걸 다시 업스케일 등)
            img, from_file = _load_output(src), src
        entry, msg = self._save_one(last, i, img, from_file, action, sv)
        return {"ui": {"cofoty5_saved": [entry], "cofoty5_msg": [msg], "cofoty5_pick": [i]}}

    def _save_one(self, last, i, img, from_file, action, o):
        """한 장을 (업스케일하고) 보정해서 저장. (저장 정보, 알림 글) 을 돌려줌"""
        base, model_type, cs, guide = o["base"], o["model_type"], o["cs"], o["guide"]
        steps, cfg, sampler, scheduler = o["steps"], o["cfg"], o["sampler"], o["scheduler"]
        # 시드: 랜덤이면 누를 때마다 새로 (같은 그림도 매번 조금씩 다르게) · 고정이면 생성 시드 + 고른 번호
        s = random.randint(0, 2 ** 48) if o["random_seed"] else last["seed"] + i
        # 생성 때의 프롬프트로 다시 인코딩 (모델 설정은 지금 값)
        # 모델 종류를 바꿨다면 LoRA는 지금 목록을 씀 (Anima용 LoRA는 체크포인트에 맞지 않음)
        same = last.get("model_type", "anima") == model_type
        m, c, v, pos, neg, full, all_loras, used, missing = self._prepare(base, last["positive"], last["negative"],
                                                                          o["quality_on"], o["quality"],
                                                                          last["lora_json"] if same else o["loras"],
                                                                          last.get("extra", ""), last.get("toggles", "[]"),
                                                                          last.get("auto_tags", ""),
                                                                          last.get("lora_prompt", "") if same else o["lora_prompt"])
        extra_txt = ""
        if action == "upscale":
            big = _scale16(img, o["up_scale"])
            lat = _encode_each(v, big.to(comfy.model_management.intermediate_device()))
            out = _sample(m, s, steps, cfg, o["up_sampler"], o["up_scheduler"], pos, neg, lat, o["up_denoise"])
            img = _decode(v, out["samples"]).cpu()
            extra_txt += f", Denoising strength: {o['up_denoise']:g}, Hires upscale: {o['up_scale']:g}"
        fixed = []
        if o["face_fix"]:
            img, ok = run_detail("face", img, m, c, v, pos, neg, s, steps, cfg, sampler, scheduler, o["face_denoise"], guide)
            if ok:
                fixed.append("얼굴")
        if o["hand_fix"]:
            img, ok = run_detail("hand", img, m, c, v, pos, neg, s, steps, cfg, sampler, scheduler, o["hand_denoise"], guide)
            if ok:
                fixed.append("손")
        if fixed:
            extra_txt += f", Detailer: {'+'.join(fixed)}"
        if from_file:
            extra_txt += f", Source: {from_file}"
        if last.get("label"):
            extra_txt += f", Item: {last['label']}"

        h, w = img.shape[1], img.shape[2]
        meta = _params_text(last["positive_clean"], last["negative"], steps, cfg, sampler, scheduler, s, w, h, base[3],
                            all_loras, extra_txt, cs)
        folder, rel = save_dir(o["save_folder"], o["date_folder"])
        stem, numbered = file_stem(o["save_name"], s)
        if last.get("label"):  # 목록 항목 이름을 파일 이름 앞에
            stem = safe_name(last["label"])[:40] + ("_" + stem if stem else "")
        fname = _save_png(img[0], folder, stem, meta, o["prompt"], o["extra_pnginfo"], numbered=numbered)
        what = ("업스케일" if action == "upscale" else "원본") + (" + " + "·".join(fixed) + " 보정" if fixed else "")
        msg = f"저장됨 ({what}): output/{rel + '/' if rel else ''}{fname}  {w}×{h}"
        if not same and last["loras"]:
            msg += " · 모델 종류가 바뀌어 생성 때의 LoRA 대신 지금 LoRA 목록을 썼습니다"
        print(f"{LOG} {msg}")
        return ({"filename": fname, "subfolder": rel, "type": "output", "kind": action, "w": int(w), "h": int(h),
                 "fixed": "·".join(fixed), "seed": int(s), "from": from_file, "src": i}, msg)

    def _generate(self, key, base, model_type, clip_skip, positive, negative, width, height, batch, seed, random_seed,
                  steps, cfg, sampler, scheduler, quality_on, quality, lora_json, extra="", toggles="[]", item=None, lora_prompt=""):
        width, height = max(16, round(width / 16) * 16), max(16, round(height / 16) * 16)
        if random_seed:
            seed = random.randint(0, 2 ** 48)
        m, c, v, pos, neg, full, loras, used, missing = self._prepare(base, positive, negative, quality_on, quality,
                                                                      lora_json, extra, toggles, (item or {}).get("tags", ""), lora_prompt)
        dev = comfy.model_management.intermediate_device()
        latent = {"samples": torch.zeros([int(batch), 4, height // 8, width // 8], device=dev)}
        out = _sample(m, seed, steps, cfg, sampler, scheduler, pos, neg, latent, 1.0)
        images = _decode(v, out["samples"]).cpu()
        pos_clean, _ = split_loras(positive)
        ex_clean, _ = split_loras(extra)
        auto_clean, _ = split_loras((item or {}).get("tags", ""))
        lp_clean, _ = split_loras(lora_prompt or "")
        # 이미지에 적히는 프롬프트(PNG 정보)는 실제로 쓴 글과 같게: 품질 칸(체크 켜짐)도 맨 앞에 넣음
        pos_clean = _join(quality if quality_on else "", lp_clean, pos_clean, ", ".join(parse_toggles(toggles)), auto_clean, ex_clean)
        _CACHE[key] = {"images": images, "seed": seed, "positive": positive, "positive_clean": pos_clean,
                       "negative": negative, "loras": loras, "lora_json": lora_json, "extra": extra,
                       "toggles": toggles, "model_type": model_type, "lora_prompt": lora_prompt,
                       "auto_tags": (item or {}).get("tags", ""), "label": (item or {}).get("label", "")}
        # 미리보기는 임시 폴더에 (지우셔도 됨)
        tmp = folder_paths.get_temp_directory()
        sub = "onenode"
        prev = []
        for i in range(images.shape[0]):
            fname = _save_png(images[i], os.path.join(tmp, sub), f"p{int(time.time() * 1000)}_{i}", None, compress=1)
            prev.append({"filename": fname, "subfolder": sub, "type": "temp"})
        note = f"{'체크포인트' if model_type == 'ckpt' else 'Anima'} · 시드 {seed} · {width}×{height} × {images.shape[0]}장"
        if item and item.get("label"):
            note = f"[{item.get('i', 0) + 1}/{item.get('n', 0)}] {item['label']} · " + note
        if used:
            note += " · LoRA " + ", ".join(used)
        if missing:
            note += " · ⚠ 못 찾은 LoRA: " + ", ".join(missing)
        print(f"{LOG} 생성 완료 — {note}")
        return {"ui": {"cofoty5_previews": prev, "cofoty5_msg": [note], "cofoty5_seed": [seed]}}


NODE_CLASS_MAPPINGS = {TYPE: CoFoTy5OneNode}
NODE_DISPLAY_NAME_MAPPINGS = {TYPE: "CoFoTy5 OneNode ®"}


# ---------------------------------------------------------------- 화면이 묻는 정보
HERE = os.path.dirname(os.path.abspath(__file__))
library = LoraLibrary(HERE, lambda: folder_paths.get_filename_list("loras"), lambda n: _full("loras", n))
routes = PromptServer.instance.routes


async def _bg(fn, *args):
    import asyncio
    return await asyncio.get_running_loop().run_in_executor(None, fn, *args)


@routes.get("/cofoty5_onenode/first_run")
async def _first_run(request):
    """이 설치에서 처음 부른 때만 fresh=true (표시 파일 first_run.done). 브라우저 기록과 상관없이 새 설치마다 한 번."""
    mark = os.path.join(HERE, "first_run.done")
    fresh = not os.path.exists(mark)
    if fresh:
        try:
            with open(mark, "w", encoding="utf-8") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
        except Exception as e:
            print("[CoFoTy5 OneNode] first_run 표시 파일을 못 만들었습니다:", e)
    return web.json_response({"fresh": fresh})


@routes.get("/cofoty5_onenode/info")
async def _info(request):
    return web.json_response({"impact": impact_status()})


def _models():
    cks = _list("checkpoints")
    return {"diffusion": _list("diffusion_models", "unet"), "te": _list("text_encoders", "clip"), "vae": _list("vae"),
            "ckpt": cks, "ckpt_family": {n: ckpt_family(n) for n in cks}}


@routes.get("/cofoty5_onenode/models")
async def _models_route(request):
    try:
        return web.json_response(await _bg(_models))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


# 구도 버튼의 '자주 쓰는' 목록 — ComfyUI/user 폴더에 저장 (노드를 업데이트해도 남음)
def _fav_path():
    try:
        d = folder_paths.get_user_directory()
    except Exception:
        d = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "cofoty5_onenode_favs.json")


FAV_DEFAULT = [{"label": "dynamic pose", "tags": "dynamic pose"}, {"label": "dynamic angle", "tags": "dynamic angle"}]


def _load_favs():
    """파일이 아직 없으면 기본 두 개. 사용자가 다 지워서 저장했다면 빈 목록 그대로"""
    if not os.path.isfile(_fav_path()):
        return [dict(x) for x in FAV_DEFAULT]
    try:
        with open(_fav_path(), "r", encoding="utf-8") as f:
            v = json.load(f).get("items", [])
        return [{"label": str(x["label"])[:30], "tags": str(x["tags"])[:300]} for x in v if isinstance(x, dict) and x.get("tags")]
    except (OSError, ValueError, AttributeError, KeyError, TypeError):
        return []


@routes.get("/cofoty5_onenode/favs")
async def _favs(request):
    return web.json_response({"items": _load_favs()})


@routes.post("/cofoty5_onenode/favs")
async def _save_favs(request):
    try:
        d = await request.json()
        items = [{"label": str(x.get("label") or x.get("tags"))[:30].strip(), "tags": str(x.get("tags"))[:300].strip()}
                 for x in (d.get("items") or [])[:60] if isinstance(x, dict) and str(x.get("tags") or "").strip()]
        p = _fav_path()
        with open(p + ".tmp", "w", encoding="utf-8") as f:
            json.dump({"items": items}, f, ensure_ascii=False, indent=1)
        os.replace(p + ".tmp", p)
        return web.json_response({"items": items})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.get("/cofoty5_onenode/loras")
async def _loras(request):
    try:
        return web.json_response({"items": await _bg(library.listing)})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.get("/cofoty5_onenode/lora_preview")
async def _lora_preview(request):
    p = await _bg(library.preview_path, request.query.get("name", ""))
    if not p:
        return web.Response(status=404)
    return web.FileResponse(p, headers={"Cache-Control": "max-age=3600"})


@routes.post("/cofoty5_onenode/lora_keywords")
async def _lora_keywords(request):
    try:
        d = await request.json()
        library.set_keywords(d.get("name", ""), d.get("keywords"))
        return web.json_response({"ok": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


from .lora_routes import register as _reg_lora_store
_reg_lora_store(routes, "/cofoty5_onenode", library)  # 세트 · 저장 위치 (공통 규격 v2)


@routes.get("/cofoty5_onenode/lora_sets")
async def _sets(request):
    return web.json_response({"sets": library.get_sets(), "types": library.get_set_types()})


@routes.post("/cofoty5_onenode/lora_sets")
async def _save_sets(request):
    try:
        d = await request.json()
        sets = library.save_sets(d.get("sets", {}), d.get("types"))
        return web.json_response({"sets": sets, "types": library.get_set_types()})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/cofoty5_onenode/ko2en")
async def _ko2en(request):
    try:
        from . import ko2en
        d = await request.json()
        texts = [str(x) for x in d.get("texts", [])][:8]
        return web.json_response(await _bg(ko2en.translate_texts, texts))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/cofoty5_onenode/en2ko")
async def _en2ko(request):
    """한글로 잠깐 보기: 프롬프트를 한글로 옮겨 보여주기만 함 (프롬프트 자체는 바꾸지 않음)"""
    try:
        from . import ko2en
        d = await request.json()
        texts = [str(x) for x in d.get("texts", [])][:8]
        return web.json_response(await _bg(ko2en.to_korean, texts))
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.get("/cofoty5_onenode/dict_status")
async def _dict_status(request):
    from . import ko2en
    return web.json_response(await _bg(ko2en.status))


@routes.post("/cofoty5_onenode/dict_download")
async def _dict_download(request):
    from . import ko2en
    return web.json_response(await _bg(ko2en.download_dict))


# ---------------------------------------------------------------- ④ 목록으로 연속 생성: 항목 파일
from . import itemlist  # noqa: E402

ITEM_DIR = os.path.join(folder_paths.get_input_directory(), "onenode")


def _item_dir():
    """input/onenode 폴더. 처음 만들 때 예시 파일을 넣어 둠 (지워도 다시 생기지 않음)"""
    if not os.path.isdir(ITEM_DIR):
        os.makedirs(ITEM_DIR, exist_ok=True)
        ex = os.path.join(HERE, "examples")
        for n in (os.listdir(ex) if os.path.isdir(ex) else []):
            try:
                shutil.copy2(os.path.join(ex, n), os.path.join(ITEM_DIR, n))
            except OSError:
                pass
    return ITEM_DIR


def _item_files():
    d = _item_dir()
    try:
        return sorted((f for f in os.listdir(d) if f.lower().endswith(itemlist.EXTS) and not f.startswith(("~$", "."))),
                      key=lambda f: (-os.path.getmtime(os.path.join(d, f)), f))
    except OSError:
        return []


@routes.get("/cofoty5_onenode/items/files")
async def _items_files(request):
    return web.json_response({"files": _item_files(), "dir": _item_dir()})


@routes.get("/cofoty5_onenode/items/rows")
async def _items_rows(request):
    name = os.path.basename(request.query.get("file", ""))
    path = os.path.join(_item_dir(), name)
    if not name or not os.path.isfile(path):
        return web.json_response({"error": f"파일이 없습니다: input/onenode/{name}"}, status=400)
    try:
        rows = await _bg(itemlist.read_items, path)
        return web.json_response({"rows": [dict(r, key=itemlist.row_key(r)) for r in rows], "mtime": os.path.getmtime(path)})
    except Exception as e:
        return web.json_response({"error": f"파일을 읽지 못했습니다 ({name}): {e}"}, status=400)


@routes.post("/cofoty5_onenode/items/open")
async def _items_open(request):
    try:
        return web.json_response({"opened": open_folder(_item_dir())})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


TRASH_DIR = "_onenode_trash"  # output 안: 연속 생성 결과 창에서 지운 그림 (다시 누르면 제자리로 복원)


@routes.post("/cofoty5_onenode/trash")
async def _trash(request):
    """연속 생성 결과 창의 [삭제] / [복원]. 지우면 output/_onenode_trash/(원래 폴더) 로 옮기고, 복원하면 제자리로"""
    try:
        d = await request.json()

        def work():
            out_root = os.path.realpath(folder_paths.get_output_directory())
            sub = "/".join(p for p in re.split(r"[\\/]+", str(d.get("subfolder") or "")) if p and p not in (".", ".."))
            name = os.path.basename(str(d.get("filename") or ""))
            if not name:
                raise ValueError("파일 이름이 없습니다")
            if d.get("op") == "restore":
                if sub == TRASH_DIR or sub.startswith(TRASH_DIR + "/"):
                    sub = sub[len(TRASH_DIR):].lstrip("/")
                src_rel, dst_rel = "/".join(x for x in (TRASH_DIR, sub) if x), sub
            else:
                src_rel, dst_rel = sub, "/".join(x for x in (TRASH_DIR, sub) if x)
            src = os.path.realpath(os.path.join(out_root, *src_rel.split("/"), name)) if src_rel else os.path.realpath(os.path.join(out_root, name))
            dst_dir = os.path.realpath(os.path.join(out_root, *dst_rel.split("/"))) if dst_rel else out_root
            if not (src.startswith(out_root + os.sep) and (dst_dir == out_root or dst_dir.startswith(out_root + os.sep))):
                raise ValueError("output 폴더 밖의 파일은 다룰 수 없습니다")
            if not os.path.isfile(src):
                raise FileNotFoundError(f"파일이 없습니다: {name}")
            os.makedirs(dst_dir, exist_ok=True)
            stem, ext = os.path.splitext(name)
            fname, k = name, 2
            while os.path.exists(os.path.join(dst_dir, fname)):
                fname, k = f"{stem}({k}){ext}", k + 1
            shutil.move(src, os.path.join(dst_dir, fname))
            return {"filename": fname, "subfolder": dst_rel, "type": "output"}

        r = await _bg(work)
        print(f"{LOG} 연속 생성 결과: {'복원' if d.get('op') == 'restore' else '삭제(휴지통으로)'} {r['subfolder']}/{r['filename']}")
        return web.json_response(r)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)


@routes.post("/cofoty5_onenode/open_folder")
async def _open(request):
    try:
        d = await request.json()
        folder, rel = save_dir(d.get("folder", ""), bool(d.get("date_folder")))
        return web.json_response({"opened": open_folder(folder), "rel": rel})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)
