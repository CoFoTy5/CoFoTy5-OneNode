"""LoRA 위치 찾기 (lora_paths.py) 
워크플로에 기록된 LoRA 경로에 파일이 없으면(폴더를 옮긴 경우) 같은 파일 이름을 loras 폴더 전체에서 찾아 씁니다.
CoFoTy5 노드(® 붙은 것)에서만 작동합니다. 기본 노드·rgthree 등은 해당 없음."""
import os

import folder_paths


def _key(name):
    return os.path.basename(str(name).replace("\\", "/")).lower()


def resolve_lora(name, names=None):
    """기록된 이름 그대로 있으면 그대로, 없으면 같은 파일 이름(대소문자 무시)을 찾아 돌려줌. 못 찾으면 None."""
    names = list(names) if names is not None else folder_paths.get_filename_list("loras")
    if name in names:
        return name
    k = _key(name)
    hits = [n for n in names if _key(n) == k]
    if not hits:
        return None
    if len(hits) > 1:
        print(f"[CoFoTy5] 같은 이름의 LoRA가 여러 폴더에 있습니다: {hits} → {sorted(hits, key=len)[0]} 사용")
    return sorted(hits, key=len)[0]
