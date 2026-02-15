# 3D Co-op Minesweeper Screen Definition (MVP)

Reference: `PRD.md`

## 1. Home/Lobby Entry

### Purpose
- Let user set nickname and either create or join a room.

### Requirements
- Nickname input (2 to 12 chars, duplicate allowed).
- `Create Room` action.
- 4-digit numeric room code input and `Join` action.
- Validation and error messages:
- Nickname length invalid.
- Room code format invalid.
- Room not found.
- Success transition to `Room Lobby`.

### Text Wireframe
```txt
[LOGO] 3D CO-OP MINESWEEPER

닉네임
[______________]   (2~12자)

[ 방 만들기 ]

----------------------------

방 코드로 입장 (4자리 숫자)
[____]  [ 입장 ]

에러 메시지 영역
- 닉네임 길이 오류
- 방 코드 형식 오류
- 존재하지 않는 방
```

## 2. Room Lobby (Ready/Start)

### Purpose
- Coordinate both players before game start.

### Requirements
- Display 2 player slots.
- Show nickname and connection/ready state per player.
- Show room code.
- Local `Ready/Unready` toggle.
- Host-only `Start` button.
- `Start` enabled only when both players are ready.
- `Leave Room` action.
- Lock nickname after game start.

### Text Wireframe
```txt
상단 바: 방 코드 [1234]   연결상태 [정상]

플레이어 슬롯 A
- 닉네임: host_name
- 상태: 접속중 / 레디

플레이어 슬롯 B
- 닉네임: guest_name
- 상태: 접속중 / 미레디

[ 레디 / 레디 해제 ]   (본인 버튼)
[ 시작 ]               (방장만 활성, 양쪽 레디 시 활성)
[ 나가기 ]

시스템 메시지
- "상대가 접속했습니다"
- "상대가 레디했습니다"
```

## 3. In-Game HUD

### Purpose
- Main gameplay view with FPS control, interaction, and minimal HUD.

### Requirements
- First-person world view with crosshair.
- Interaction rules:
- On-site only, range 3 blocks.
- Left click: open cell.
- Right click: flag toggle.
- Feet-cell interaction allowed.
- HUD must show only:
- Team lives.
- Local player state (alive/dead).
- Room code.
- Connection state.
- Team chat panel and input.
- No remaining-mine counter.
- Death state:
- 3-second lock.
- No movement/interaction.
- Camera fixed at death position.

### Text Wireframe
```txt
중앙: 조준점 (+)

좌상단 HUD
- 팀 목숨: 5
- 내 상태: ALIVE / DEAD
- 방 코드: 1234
- 연결상태: 정상 / 재접속 대기(XX초)

하단 중앙
- 채팅 로그(최근 N줄)
- 입력창 [메시지 입력...] [전송]

월드 상호작용
- 좌클릭: 칸 열기
- 우클릭: 깃발 토글
- 상호작용 거리: 3블록
- 발밑 칸 상호작용 허용

사망 시 화면
- "사망! 3초 후 부활"
- 카메라: 사망 위치 고정
- 이동/상호작용 비활성
```

## 4. Tab Map Overlay

### Purpose
- Temporary tactical map for position and revealed-state awareness.

### Requirements
- Visible only while holding `Tab`.
- Large centered semi-transparent overlay.
- View-only (no click interaction).
- While open:
- Movement allowed.
- Mouse look disabled.
- Map content:
- 16x16 grid.
- Opened safe cell markers.
- Flags.
- Exploded mine `X` markers.
- Own position marker.
- Teammate position marker.
- Closed-cell info remains hidden.

### Text Wireframe
```txt
(화면 중앙 대형 반투명 패널)

[ 16 x 16 지도 그리드 ]

셀 표현
- 닫힘 칸: 비공개 타일
- 열린 안전칸: 평지 표식
- 깃발 칸: 깃발 아이콘
- 폭발 칸: X 표식

플레이어 마커
- 나: 파란 점
- 팀원: 초록 점

동작 규칙
- Tab 누르는 동안만 표시
- 클릭 불가(조회 전용)
- 이동 가능
- 시점 회전 불가
```

## 5. Result/Restart

### Purpose
- Show end state and allow immediate replay in same room.

### Requirements
- Show result: victory or defeat.
- Show summary stats (lives spent, total explosions, play time).
- `Restart in Same Room` action.
- Restart generates new seed.
- `Back to Lobby` action.
- Keep mine positions hidden even after game over.
- Chat log resets on restart.

### Text Wireframe
```txt
결과 타이틀
- VICTORY 또는 DEFEAT

요약 정보
- 소모 목숨
- 총 폭발 횟수
- 플레이 시간

[ 같은 방 재시작 ]   (새 시드 생성)
[ 로비로 ]

안내 문구
- "지뢰 위치는 공개되지 않습니다."
- "채팅 로그는 재시작 시 초기화됩니다."
```

## Screen Count
- Total: 5 screens (`4 full screens + 1 in-game overlay`).
