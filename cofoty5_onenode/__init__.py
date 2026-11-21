"""cofoty5_onenode — CoFoTy5 OneNode ® (Anima · 체크포인트, 노드 하나로 생성 · 고른 한 장 업스케일/저장 · 손·얼굴 보정) + 상태 표시줄 · 리셋"""
from . import cofoty5_sched  # noqa: F401  beta57 스케줄러 (이미 있으면 아무것도 안 함)
from .simple_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from . import restart  # noqa: F401  /cofoty5_onenode/restart
from . import monitor  # noqa: F401  /cofoty5_onenode/monitor
from . import accel  # noqa: F401  /cofoty5_onenode/accel (가속 켜기 · 다시 시험)
from . import workflow_seed  # noqa: F401  왼쪽 [워크플로] 즐겨찾기에 시작용 워크플로

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
