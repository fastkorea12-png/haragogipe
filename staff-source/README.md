# 하라고지페 직원 근무 도움 챗봇

매뉴얼과 와인 목록을 같은 Git 버전으로 관리하고, 점검을 통과한 HTML을 배포한다. Gemini AI는 Cloudflare Worker와 서버 비밀 키를 설정한 뒤 선택적으로 켠다.

## 자료 관리

- `지식/01~10_*.md`: 근무 매뉴얼. 각 항목의 상태·키워드·본문을 수정한다. 확인되지 않은 정책은 `상태: 확인`으로 둔다.
- `도구/와인_설명_원본_1008.json`: 지정 맛 점수 탭 A:N의 허용된 원문.
- `도구/메뉴판_허용자료_1008.json`: List 탭 A:H와 K의 허용된 원문.
- `도구/와인_이름_연결표.json`: 한글명 또는 유일한 영문명이 일치하는 제품 연결 근거. 자동 생성.
- `지식/11~12_*.md`, `도구/와인_추천_데이터.json`, `챗봇_시안.html`, 시험 결과: 자동 생성. 원본을 먼저 고친다.

Google 시트를 고친 것만으로 Git 자료가 바뀌지는 않는다. 허용한 탭·열만 다시 읽어 원본 JSON을 갱신한 뒤 아래 명령을 실행한다. 다른 탭이나 미허용 열을 내보내지 않는다. 이름 연결이 모호하거나 점수가 부족하면 확인 목록에 남기며 수치를 만들지 않는다.

```sh
npm run update
```

명령이 성공하면 매뉴얼·와인 목록과 시안이 함께 갱신된다. 화면의 자료 버전은 매뉴얼·목록·템플릿의 해시라 같은 입력으로 같은 버전을 만든다.

## Gemini AI와 개선 질문 기록

GitHub Pages 앞에 비밀 API 키를 감추는 Cloudflare Worker를 둔다. Gemini 3.1 Flash-Lite가 관련 매뉴얼 조각과 짧은 대화 문맥을 받아 답하고, 와인 점수 추천은 현재 결정형 로직을 계속 쓴다. Worker 코드는 `서버/`에 있다. Gemini AI key is sent in a server-only header.

### 최초 설정

1. Cloudflare 계정에서 `cd 직원챗봇/서버 && npx wrangler login`으로 로그인한다.
2. 같은 경로에서 `npx wrangler d1 create haragogipe-staff-question-log`을 실행하고 출력된 database ID를 `wrangler.jsonc`에 기록해 Git에 올린다.
3. Gemini API 키를 만들고 GitHub 저장소 Settings → Secrets and variables → Actions에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `GEMINI_API_KEY` secrets를 설정한다. 세 값은 코드·채팅·일반 변수로 두지 않는다.
4. 같은 설정에서 Actions variable `HARAGO_GEMINI_ENABLED=true`를 추가한다. 직원 챗봇 Git 업데이트 workflow가 D1 스키마와 Worker를 배포한 뒤 Pages HTML에 Worker URL을 연결한다.

Gemini 대화는 직원이 `Gemini 대화`를 켜야 전송된다. 질문, 최근 몇 턴, 일치한 매뉴얼 항목이 Google Gemini API에 전달된다. 제한한 급여·계좌·매입가·도매가·희망가·재고 질문은 Worker에서 차단한다. 고객·직원 이름, 연락처, 결제 정보나 개인 사정을 프롬프트에 적지 않는다. `대화 지우기`는 화면과 세션 문맥을 지운다.

### 질문 개선 기록

개별 질문마다 체크박스를 켠 경우에만 질문 문장과 매뉴얼 분류를 저장한다. 답변과 직원 식별자는 저장하지 않고, 이메일·전화·식별번호 패턴과 제한된 업무 주제는 자동 제외한다. 90일이 지나면 매일 자동 삭제한다. Cloudflare D1에서 최근 질문 빈도는 다음과 같이 확인할 수 있다.

```sql
SELECT category, normalized, MIN(question) AS example, COUNT(*) AS count
FROM question_log
WHERE created_at >= datetime('now', '-30 days')
GROUP BY category, normalized
ORDER BY count DESC, category;
```

질문 기록은 직원이 매 턴 직접 선택한다. Gemini를 꺼도 기존 자료 기반 검색과 와인 추천은 계속 사용할 수 있다.

## Git 배포

`fastkorea12-png/haragogipe` 저장소의 `main` 브랜치 `staff-source/`에서 원본을 관리한다. 해당 경로가 수정되면 직원 챗봇 워크플로가 `npm run update`를 실행하고, 통과한 시안을 `gh-pages` 브랜치의 `staff/index.html`에 배포한다. 기존 매장 사이트와 별도 경로다.

오픈·마감 체크는 같은 브라우저에 날짜별로 저장된다. 다른 직원·기기와 공유되는 완료 기록은 아니다. 자료만으로 확정할 수 없는 운영시각·가격은 화면에서 확인 상태를 표시한다.
