import { describe, expect, it } from 'vitest'
import { isBotUserAgent, parseBrowser, parseOs } from './client'

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36 Edg/153.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 OPR/107.0.0.0',
  safariIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/121.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
} as const

describe('parseBrowser', () => {
  it('Chrome을 메이저 버전까지 읽는다', () => {
    expect(parseBrowser(UA.chromeWin)).toBe('Chrome 153')
  })

  // 파생 브라우저는 UA에 Chrome을 함께 실어서, 순서가 틀리면 전부 Chrome으로 뭉개진다
  it('Chrome UA를 함께 싣는 파생 브라우저를 구분한다', () => {
    expect(parseBrowser(UA.edgeWin)).toBe('Edge 153')
    expect(parseBrowser(UA.samsung)).toBe('Samsung Internet 25')
    expect(parseBrowser(UA.opera)).toBe('Opera 107')
  })

  it('iOS의 Chrome·Firefox는 Safari가 아니라 원래 브라우저로 읽는다', () => {
    expect(parseBrowser(UA.chromeIos)).toBe('Chrome 121')
    expect(parseBrowser(UA.firefoxMac)).toBe('Firefox 124')
  })

  it('Safari는 Version/의 값을 쓴다', () => {
    expect(parseBrowser(UA.safariIos)).toBe('Safari 17')
    expect(parseBrowser(UA.safariMac)).toBe('Safari 17')
  })

  it('규칙에 없는 UA는 비운다 — 원문이 client.userAgent에 남는다', () => {
    expect(parseBrowser('curl/8.4.0')).toBeUndefined()
  })
})

describe('parseOs', () => {
  it('모바일 OS는 마이너 버전까지 읽는다', () => {
    expect(parseOs(UA.safariIos)).toBe('iOS 17.5')
    expect(parseOs(UA.androidChrome)).toBe('Android 14')
  })

  // UA만으로는 Windows 10과 11을 가를 수 없고 macOS는 10_15_7로 고정 보고된다.
  // 없는 정확도를 지어내지 않는 것이 이 표기의 목적이다
  it('UA가 보장하지 못하는 버전은 단정하지 않는다', () => {
    expect(parseOs(UA.chromeWin)).toBe('Windows 10+')
    expect(parseOs(UA.safariMac)).toBe('macOS')
  })

  it('규칙에 없는 UA는 비운다', () => {
    expect(parseOs('curl/8.4.0')).toBeUndefined()
  })
})

describe('isBotUserAgent', () => {
  it('검색엔진·링크 미리보기 크롤러를 잡는다', () => {
    const bots = [
      // 실제 운영 로그에 찍힌 bingbot 렌더러 UA
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/136.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'AdsBot-Google (+http://www.google.com/adsbot.html)',
      // 실제 운영 로그에 찍힌 GoogleOther UA — 이름에 bot이 없다
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GoogleOther) Chrome/153.0.8010.52 Safari/537.36',
      'Mozilla/5.0 (compatible; Google-Extended)',
      'Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)',
      'Mozilla/5.0 (compatible; Daum/4.1; +https://cs.daum.net/faq/15/4118.html?faqId=28966) Daumoa',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/136.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    ]
    for (const ua of bots) expect(isBotUserAgent(ua), ua).toBe(true)
  })

  it('일반 브라우저는 잡지 않는다', () => {
    for (const ua of Object.values(UA)) expect(isBotUserAgent(ua), ua).toBe(false)
  })

  // 제조사 이름에 bot이 들어가 `bot\b`에 걸리는 단말 — 실사용자라 수집해야 한다
  it('CUBOT 단말은 봇으로 보지 않는다', () => {
    expect(
      isBotUserAgent('Mozilla/5.0 (Linux; Android 12; CUBOT P60) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36'),
    ).toBe(false)
  })
})
