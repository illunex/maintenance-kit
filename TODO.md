# TODO

## 1. 라이선스 명의를 ILLUNEX로 변경

`LICENSE`의 저작권자가 개인 명의(`Copyright (c) 2026 ChangGyu Im`)로 되어 있다.
npm에 public으로 배포되는 패키지라 이 값이 그대로 외부에 노출되므로,
회사 자산으로 관리한다면 회사 명의로 바꿔야 한다.

- [ ] `LICENSE` 저작권자를 ILLUNEX로 변경
- [ ] `package.json`의 `author`도 함께 정리할지 확인 (현재 개인 명의)
- [ ] 변경 전 최초 작성자(임창규)와 합의

## 2. 기본 점검 화면 모바일 반응형 적용

`src/react/default-screen.tsx`는 스타일이 전부 인라인 `style` 객체라 미디어 쿼리를
걸 수 없고, 반응형 처리가 `scheduleCard`의 `maxWidth: 100%` 하나뿐이다.
데스크톱 고정값이 모바일에 그대로 내려가 화면이 답답해진다.

미디어 쿼리 없이 `clamp()`만으로 대부분 해결된다.

- [ ] 폰트 크기를 `clamp()`로 전환 (제목 48px, 부제 24px, 카드 20px, 설명 18px이 모두 고정)
- [ ] `illustration` 고정 244px → `min(244px, 70%)`
- [ ] `scheduleBody`의 `height: 79px` 고정 해제 → `minHeight` + 좌우 패딩 (현재 텍스트가 테두리에 붙음)
- [ ] `minHeight: 100vh` → `100dvh` (iOS Safari 주소창 높이 문제)
- [ ] 한국어 줄바꿈용 `wordBreak: 'keep-all'`, 안전장치로 `overflowWrap: 'anywhere'` 추가
  (`<br />` 강제 개행과 자동 줄바꿈이 겹쳐 줄 길이가 들쭉날쭉함)
- [ ] Figma 시안(`서비스일시중단 팝업 18702:2`)에 모바일 시안이 있는지 확인 후 수치 확정
