CoFoTy5 OneNode — 기존 ComfyUI에 추가한 기록
=====================================

이 폴더는 OneNode 설치 프로그램이 [이미 쓰는 ComfyUI에 추가]로 설치할 때 만든 기록 폴더입니다.
OneNode를 지울 때 필요하니 지우지 마세요.

■ OneNode 열기
  평소처럼 ComfyUI를 켠 뒤, 왼쪽 [워크플로] ★ 즐겨찾기의 'CoFoTy5 OneNode'를 누르세요.
  (설치 후 처음 켤 때는 새 탭으로 한 번 저절로 열립니다)

■ 이 폴더에 있는 것
  addon_info.json        ← 어느 ComfyUI에 추가했는지
  added_ledger.txt       ← OneNode가 더한 노드 · 모델 · 바로가기 목록 (지울 때 이것만 지움)
  pip_before_*.txt       ← 설치 직전의 파이썬 부품 목록 (pip freeze 백업)
  install.log            ← 설치 기록
  Uninstall_OneNode.bat  ← OneNode 지우기

■ 지우기
  Uninstall_OneNode.bat 를 실행하세요. OneNode가 더한 것만 지웁니다.
  함께 받은 노드와 모델은 지울지 따로 물어봅니다.
  ComfyUI 본체 · 설정 · 원래 있던 노드와 모델 · 만든 그림 · 파이썬 부품은 그대로 둡니다.

■ 업데이트 · 고치기
  새 설치 프로그램(OneNode_Setup.bat)에서 [이미 쓰는 ComfyUI에 추가]를 고르고 같은 ComfyUI를 고르세요.
  빠진 것만 채우고 노드 파일을 새 버전으로 바꿉니다. (LoRA 세트 · 사전 같은 사용자 파일은 그대로)
