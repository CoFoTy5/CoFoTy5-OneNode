"""cofoty5_onenode — 시작용 워크플로를 왼쪽 [워크플로] 목록의 즐겨찾기에 넣어 두기 (이 설치에서 처음 한 번만)

초보자가 탭을 실수로 닫아도 왼쪽 [워크플로] ★ 즐겨찾기에서 다시 열 수 있게 합니다.
 - 파일: ComfyUI/user/default/workflows/CoFoTy5 OneNode.json  (이미 있으면 덮어쓰지 않음)
 - 즐겨찾기: 같은 폴더의 .index.json 의 favorites (이미 있는 즐겨찾기는 그대로 두고 하나만 추가)
 - 표시 파일 workflow_seeded.done 이 있으면 다시 하지 않음 → 사용자가 즐겨찾기를 풀거나 지워도 되살리지 않음
"""
import json
import os
import shutil
import time

import folder_paths

_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.join(_HERE, "CoFoTy5 OneNode.json")
_MARK = os.path.join(_HERE, "workflow_seeded.done")
_NAME = "CoFoTy5 OneNode.json"


def seed():
    try:
        if os.path.exists(_MARK) or not os.path.isfile(_SRC):
            return
        wf_dir = os.path.join(folder_paths.get_user_directory(), "default", "workflows")
        os.makedirs(wf_dir, exist_ok=True)
        dst = os.path.join(wf_dir, _NAME)
        if not os.path.exists(dst):
            shutil.copyfile(_SRC, dst)
        idx = os.path.join(wf_dir, ".index.json")
        data = {}
        if os.path.exists(idx):
            try:
                with open(idx, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
            except Exception:
                data = {}
        fav = data.get("favorites")
        fav = list(fav) if isinstance(fav, list) else []
        key = "workflows/" + _NAME
        if key not in fav:
            fav.append(key)
        data["favorites"] = fav
        with open(idx, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        with open(_MARK, "w", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S"))
        print("[CoFoTy5 OneNode] 왼쪽 [워크플로] 즐겨찾기에 'CoFoTy5 OneNode'를 넣었습니다.")
    except Exception as e:
        print("[CoFoTy5 OneNode] 시작용 워크플로 즐겨찾기 넣기 실패(무시):", e)


seed()
