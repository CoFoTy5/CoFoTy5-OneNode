CoFoTy5 OneNode — 설치 폴더 안내
=====================================

■ 켜기
  CoFoTy5_OneNode.exe 를 두 번 누르세요. (바탕화면의 [CoFoTy5 OneNode]도 같음)
  검은 창이 뜨고 작업 화면이 열리면, 검은 창은 저절로 작업 표시줄로 내려갑니다. 그 창을 닫으면 꺼집니다.
  (exe가 없거나 열리지 않으면 Start_OneNode.bat 를 두 번 눌러도 같습니다)

■ 어디에 무엇이 있나요
  ComfyUI_windows_portable\                 ← ComfyUI 공식 포터블판 그대로
    ComfyUI\output\                        ← 만든 그림
    ComfyUI\models\loras\                  ← LoRA 파일을 여기에 넣으세요
    ComfyUI\models\diffusion_models\       ← Anima 모델
    ComfyUI\custom_nodes\cofoty5_onenode\  ← CoFoTy5 OneNode 노드
  _installer\                               ← 설치 기록 · 지우기 도구 (지우지 마세요)

■ 가속 기능 (설치할 때 골랐다면)
  노드의 ① 모델 설정 제목 줄에 [⚡ 가속 켜짐/꺼짐]이 보입니다. 눌러서 켜고 끕니다.
  [사용 불가]면 이 PC에서는 가속이 안 되는 것이고, 그림 만들기는 평소처럼 됩니다. [다시 시험]으로 다시 확인할 수 있습니다.
  시험 결과: ComfyUI_windows_portable\ComfyUI\user\cofoty5_accel.json

■ 지우기
  Uninstall_OneNode.bat 를 실행하세요. (만든 그림은 바탕화면으로 옮겨 둘 수 있습니다)
  또는 ComfyUI를 끈 뒤 이 폴더를 통째로 지워도 됩니다. 윈도우에는 아무것도 남지 않습니다.

■ 고장 났을 때 (복구)
  처음 받았던 설치 프로그램(OneNode_Setup.bat)을 다시 실행하고 같은 폴더를 고르세요.
  빠지거나 손상된 파일만 다시 받고, 노드를 원래대로 고칩니다. 만든 그림 · LoRA · 모델은 그대로 둡니다.

■ 더 배우고 싶을 때
  여기 설치된 ComfyUI는 공식 구조 그대로라서, 인터넷의 ComfyUI 강좌 · 워크플로를 그대로 쓸 수 있습니다.
  위쪽 메뉴의 Manager(매니저)로 다른 노드를 설치할 수 있습니다.
  다만 ComfyUI 업데이트나 다른 노드 설치는 OneNode 노드가 동작하지 않게 만들 수도 있습니다.
  그럴 때는 위의 [복구]를 하거나, 업데이트 전에 이 폴더를 통째로 복사해 두세요.
