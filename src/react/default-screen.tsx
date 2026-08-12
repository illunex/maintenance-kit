import type { CSSProperties } from 'react'
import { formatMaintenancePeriod, type MaintenanceInfo } from '../core'
import { MAINTENANCE_ILLUSTRATION_SVG } from './illustration'

interface DefaultMaintenanceScreenProps {
  info: MaintenanceInfo | null
}

const FONT_FAMILY =
  "Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"

const POINT_COLOR = '#72889d'

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    width: '100%',
    boxSizing: 'border-box',
    padding: '48px 24px',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontFamily: FONT_FAMILY,
    textAlign: 'center',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
  },
  titleGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  subtitle: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 400,
    letterSpacing: '-0.72px',
  },
  title: {
    margin: 0,
    fontSize: '48px',
    fontWeight: 700,
    letterSpacing: '-1.44px',
  },
  illustration: {
    width: '244px',
    height: '162px',
  },
  description: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-0.54px',
  },
  scheduleCard: {
    width: '399px',
    maxWidth: '100%',
  },
  scheduleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px',
    backgroundColor: POINT_COLOR,
    borderRadius: '10px 10px 0 0',
  },
  scheduleHeaderText: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-0.6px',
    color: '#ffffff',
  },
  scheduleBody: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '79px',
    boxSizing: 'border-box',
    backgroundColor: '#ffffff',
    border: `1px solid ${POINT_COLOR}`,
    borderRadius: '0 0 10px 10px',
  },
  scheduleBodyText: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-0.6px',
  },
  apology: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: '-0.45px',
  },
  email: {
    color: '#1e32b2',
  },
  footnote: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: '-0.45px',
  },
} satisfies Record<string, CSSProperties>

/** fallback 미지정 시 보여주는 기본 점검 화면 (Figma: 서비스일시중단 팝업 18702:2) */
export function DefaultMaintenanceScreen({ info }: DefaultMaintenanceScreenProps) {
  const period = formatMaintenancePeriod(info?.startTime, info?.endTime)

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.titleGroup}>
          <p style={styles.subtitle}>시스템 유지보수 작업으로 인한</p>
          <h1 style={styles.title}>{info?.title ?? '서비스 일시 중단 안내'}</h1>
        </div>
        <div
          style={styles.illustration}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: MAINTENANCE_ILLUSTRATION_SVG }}
        />
        <p style={styles.description}>
          시스템 유지보수 작업으로 인해 아래와 같이
          <br />
          서비스 이용이 일시적으로 중단될 예정입니다.
        </p>
        {period !== null && (
          <div style={styles.scheduleCard}>
            <div style={styles.scheduleHeader}>
              <p style={styles.scheduleHeaderText}>작업 일정</p>
            </div>
            <div style={styles.scheduleBody}>
              <p style={styles.scheduleBodyText}>{period}</p>
            </div>
          </div>
        )}
        <p style={styles.apology}>
          사용에 불편을 드려 죄송합니다.
          <br />
          더 나은 서비스를 위하여 시스템 작업 중입니다.
          <br />
          보다 편리하고 안정적인 서비스를 제공할 수 있도록
          <br />
          최선을 다 하겠습니다.
          <br />
          담당자 이메일 : <span style={styles.email}>help@illunex.com</span>
        </p>
        <p style={styles.footnote}>작업 상황에 따라 서비스 중단 시간은 달라질 수 있습니다.</p>
      </div>
    </div>
  )
}
