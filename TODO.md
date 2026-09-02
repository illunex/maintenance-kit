# TODO

## 1. Figma 모바일 시안과 점검 화면 수치 대조

기본 점검 화면 반응형은 적용됐지만(`src/react/default-screen.tsx`), 축소 구간의
수치는 Figma 시안이 아니라 임의로 잡은 값이다. 데스크톱 수치를 `clamp()`의
상한으로 삼아 기존 화면은 그대로지만, 모바일 구간은 확인이 필요하다.

- [ ] Figma 시안(`서비스일시중단 팝업 18702:2`)에 모바일 시안이 있는지 확인
- [ ] 있으면 `clamp()` 하한값(제목 28px, 부제 16px, 카드 16px, 설명 15px)과
      `illustration`의 `min(244px, 70%)`를 시안 수치로 교체
- [ ] 실제 단말(360·390px 폭)에서 일정 카드 줄바꿈 확인

## 2. esbuild override 제거

`pnpm audit`의 esbuild 취약점(GHSA-g7r4-m6w7-qqqr)을 막으려고 `package.json`의
`pnpm.overrides`로 esbuild를 `^0.28.1`로 올려둔 상태다. tsup 8.5.1이
`esbuild: ^0.27.0`으로 범위를 잡고 있어 넣은 임시 조치다.

- [ ] tsup이 esbuild `^0.28` 이상을 지원하면 `pnpm.overrides` 제거
- [ ] 제거 후 `pnpm audit`·`pnpm build` 재확인

## 3. CI 잡을 required status check로 지정

`.github/workflows/ci.yml`이 추가됐지만, 저장소 설정에서 required로 지정하지
않으면 체크가 실패해도 머지를 막지 못한다. 저장소 관리자 권한이 필요하다.

- [ ] Settings → Branches → `main` 브랜치 보호 규칙에 `verify` 잡 추가
