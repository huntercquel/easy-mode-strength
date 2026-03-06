export type Tier = 'A' | 'B' | 'C'
export type BackStatus = 'green' | 'yellow' | 'red'
export type AuthMode = 'password' | 'otp'
export type LogType = 'full' | 'core_only' | 'recovery_substitute'

export interface Exercise {
  id: string
  name: string
  load: string
  prescription: string
}

export interface SessionConfig {
  name: string
  focus: string
  exercises: Exercise[]
  tierC: string[]
  tierB: string[]
  tierA: string[]
}

export interface SetRow {
  reps: string
  load: string
  rpe: string
  done: boolean
}

export interface LogEntry {
  id: string
  workoutKey: string
  localDate: string
  week: number
  type: LogType
  plannedSession: number
  completedSession: number
  tier: Tier
  backStatus: BackStatus
  energy: number
  exerciseSetCount: number
  checklistCompleted: number
  rotationAdvanced: boolean
  note: string
}

export interface DailyRoutineTrack {
  committed: boolean
  morningResetDone: boolean
  snacks: Record<number, boolean>
}

export interface AppState {
  week: number
  nextSession: number
  timeTier: Tier
  minutesAvailable: number
  backStatus: BackStatus
  energy: number
  notes: string
  logs: LogEntry[]
  coreDays: Record<string, boolean>
  dailyRoutineByDate: Record<string, DailyRoutineTrack>
  sessionConfigs: Record<number, SessionConfig>
  setLogsByKey: Record<string, Record<string, SetRow[]>>
  checksByKey: Record<string, Record<number, boolean>>
}

export interface Recommendation {
  tier: Tier
  session: number
  plannedSession: number
  note: string
  severity: BackStatus
  rotationAdvancedOnComplete: boolean
  completionType: Exclude<LogType, 'core_only'>
}

export interface WeekStats {
  wins: number
  fullSessions: number
  coreOnlyWins: number
  recoverySubs: number
  progress: number
}

const MAX_LOG_ENTRIES = 120

export const tierToMinutesMap: Record<Tier, number> = {
  C: 30,
  B: 50,
  A: 80,
}

export const tierDescriptions: Record<Tier, string> = {
  C: 'Tier C (25-35 min)',
  B: 'Tier B (45-60 min)',
  A: 'Tier A (75+ min)',
}

export const DAILY_SNACK_SLOTS = 6

export const defaultSessionConfigs: Record<number, SessionConfig> = {
  1: {
    name: 'Session 1 - Brace + Pull',
    focus: 'Core Base first, then pull work if tolerated',
    exercises: [
      { id: 's1e1', name: 'RKC plank', load: '', prescription: '3 x 15-25 sec (Core Base)' },
      {
        id: 's1e2',
        name: 'Dead bug (band/cable pulldown)',
        load: '',
        prescription: '3 x 6/side, slow tempo (Core Base)',
      },
      { id: 's1e3', name: 'Suitcase carry', load: 'Heavy DB/KB', prescription: '3 x 30-45 sec/side (Core Base)' },
      {
        id: 's1e4',
        name: 'Pull-up variation',
        load: 'Tier A: weighted / Tier B: BW',
        prescription: 'Tier A: 4-6 x 3-6, Tier B: 3-4 sets with 2 reps in reserve',
      },
    ],
    tierC: [
      'Do Core Base only (required) before any lifting decisions',
      'Skip lifting and add 10-20 min easy walk',
      'If symptoms ramp up next morning, stay Tier C for 48-72h',
    ],
    tierB: ['After Core Base: bodyweight pull-ups for 3-4 sets, leave 2 reps in reserve'],
    tierA: ['After Core Base: weighted pull-ups for 4-6 sets of 3-6 reps'],
  },
  2: {
    name: 'Session 2 - Anti-rotation + Push',
    focus: 'Core Base first, then push bonus',
    exercises: [
      { id: 's2e1', name: 'Pallof press', load: 'Band/cable', prescription: '3 x 8/side with 2-sec hold (Core Base)' },
      { id: 's2e2', name: 'Side plank row', load: 'Band/cable', prescription: '3 x 8/side (Core Base)' },
      {
        id: 's2e3',
        name: 'Front rack carry (or heavy farmer carry)',
        load: 'Heavy',
        prescription: '3 x 30-45 sec (Core Base)',
      },
      {
        id: 's2e4',
        name: 'Push variation',
        load: 'Tier A: weighted dips / Tier B: dips or push-ups',
        prescription: 'Tier A: 4-6 x 3-6, Tier B: 3-4 sets with 2 reps in reserve',
      },
    ],
    tierC: [
      'Do Core Base only (required)',
      'Skip lifting, add one extra Pallof round + easy walk',
      'Keep pain <= 3/10 during and next day',
    ],
    tierB: ['After Core Base: dips or push-ups for 3-4 sets with 2 reps in reserve'],
    tierA: ['After Core Base: weighted dips for 4-6 sets of 3-6 reps'],
  },
  3: {
    name: 'Session 3 - Hinge Tolerance + Legs',
    focus: 'Back-friendly lower exposure, no RDLs',
    exercises: [
      { id: 's3e1', name: 'McGill curl-up', load: '', prescription: '5 x 10-sec holds (Core Base)' },
      { id: 's3e2', name: 'Bird dog', load: '', prescription: '6/side with 5-sec holds (Core Base)' },
      {
        id: 's3e3',
        name: 'Hip-driven back extension',
        load: 'Bodyweight or light',
        prescription: '3 x 8-12, smooth reps, stop before pinch (Core Base)',
      },
      {
        id: 's3e4',
        name: 'Squat variation',
        load: 'Tier A: tempo squat / Tier B: goblet + split squat',
        prescription: 'Tier A: 4 x 3-6, Tier B: 3 x 8-10 + 2-3 x 8/side',
      },
    ],
    tierC: [
      'Do Core Base only, no squats if back is not happy',
      'Swap lifting for 15-25 min incline walk',
      'No RDLs for now',
    ],
    tierB: ['After Core Base: goblet squat 3 x 8-10 + split squat 2-3 x 8/side'],
    tierA: ['After Core Base: tempo squat (3-sec down + 1-sec pause) 4 x 3-6, stop before butt-wink'],
  },
  4: {
    name: 'Session 4 - Mixed Core + Capacity',
    focus: 'Bulletproofing: anti-rotation, carries, and easy capacity',
    exercises: [
      { id: 's4e1', name: 'Cable chop hold', load: 'Cable/band', prescription: '3 x 20 sec/side (Core Base)' },
      { id: 's4e2', name: 'Side plank', load: '', prescription: '2 x 30-45 sec/side (Core Base)' },
      {
        id: 's4e3',
        name: 'Carry ladder',
        load: 'Suitcase / farmer / front rack',
        prescription: '10 min rotating carries (Core Base)',
      },
      {
        id: 's4e4',
        name: 'Capacity option',
        load: 'Tier A: light cali / Tier B: simple circuit',
        prescription: 'Tier A: technique/volume cali, Tier B: 12-15 min push-ups -> rows -> carries',
      },
    ],
    tierC: ['Do Core Base only, then walk', 'Tier C still counts as a win'],
    tierB: ['After Core Base: 12-15 min circuit (not to failure): push-ups -> rows -> carries'],
    tierA: ['After Core Base: lighter technique/volume cali (ex: muscle-up practice + easy pull/push volume)'],
  },
}

export function cloneSessionConfigs(configs: Record<number, SessionConfig>): Record<number, SessionConfig> {
  return Object.fromEntries(
    Object.entries(configs).map(([sessionNum, cfg]) => [
      Number(sessionNum),
      {
        ...cfg,
        exercises: cfg.exercises.map((exercise) => ({ ...exercise })),
        tierA: [...cfg.tierA],
        tierB: [...cfg.tierB],
        tierC: [...cfg.tierC],
      },
    ]),
  ) as Record<number, SessionConfig>
}

function containsLegacyTemplateData(configs: Record<number, SessionConfig>): boolean {
  const legacyMarkers = [
    'Session 1 - Pull + Core',
    'Session 2 - Lower + Push',
    'Session 3 - Muscle-Up Skill + Pull',
    'Session 4 - Push + Lower + Core',
    'Weighted Pull-ups',
    'Bodyweight Pull-up Back-off',
    'Row Variation',
    'Core (Side plank + Bird dog)',
    'Main lift only + core minimum',
  ]

  return Object.values(configs).some((cfg) => {
    if (legacyMarkers.some((marker) => cfg.name.includes(marker) || cfg.focus.includes(marker))) {
      return true
    }

    if (cfg.tierA.concat(cfg.tierB, cfg.tierC).some((rule) => legacyMarkers.some((marker) => rule.includes(marker)))) {
      return true
    }

    return cfg.exercises.some((exercise) =>
      legacyMarkers.some(
        (marker) => exercise.name.includes(marker) || exercise.load.includes(marker) || exercise.prescription.includes(marker),
      ),
    )
  })
}

export function normalizeSessionConfigs(raw: Partial<Record<number, SessionConfig>> | undefined): Record<number, SessionConfig> {
  const merged = {
    ...cloneSessionConfigs(defaultSessionConfigs),
    ...(raw ?? {}),
  } as Record<number, SessionConfig>

  if (containsLegacyTemplateData(merged)) {
    return cloneSessionConfigs(defaultSessionConfigs)
  }

  return merged
}

export const defaultState: AppState = {
  week: 1,
  nextSession: 1,
  timeTier: 'C',
  minutesAvailable: tierToMinutesMap.C,
  backStatus: 'green',
  energy: 3,
  notes: '',
  logs: [],
  coreDays: {},
  dailyRoutineByDate: {},
  sessionConfigs: cloneSessionConfigs(defaultSessionConfigs),
  setLogsByKey: {},
  checksByKey: {},
}

export function getTierFromTime(minutes: number): Tier {
  if (minutes >= 75) return 'A'
  if (minutes >= 45) return 'B'
  return 'C'
}

export function minutesFromTier(tier: Tier) {
  return tierToMinutesMap[tier]
}

export function normalizeTier(value: unknown, fallback: Tier = 'C'): Tier {
  return value === 'A' || value === 'B' || value === 'C' ? value : fallback
}

export function normalizeBackStatus(value: unknown, fallback: BackStatus = 'green'): BackStatus {
  return value === 'green' || value === 'yellow' || value === 'red' ? value : fallback
}

function normalizeSessionNumber(value: unknown, fallback = 1): number {
  const num = Number(value)
  if (!Number.isInteger(num) || num < 1 || num > 4) {
    return fallback
  }
  return num
}

function normalizeWeek(value: unknown, fallback = 1): number {
  const num = Number(value)
  if (!Number.isInteger(num) || num < 1 || num > 4) {
    return fallback
  }
  return num
}

function normalizeEnergy(value: unknown, fallback = 3): number {
  const num = Number(value)
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    return fallback
  }
  return num
}

function normalizeCount(value: unknown, fallback = 0): number {
  const num = Number(value)
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

export function makeDefaultSnackChecks(): Record<number, boolean> {
  const snacks: Record<number, boolean> = {}
  for (let idx = 0; idx < DAILY_SNACK_SLOTS; idx += 1) {
    snacks[idx] = false
  }
  return snacks
}

export function normalizeSnackChecks(raw: unknown): Record<number, boolean> {
  const normalized = makeDefaultSnackChecks()

  if (!raw || typeof raw !== 'object') {
    return normalized
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(key)
    if (Number.isNaN(idx) || idx < 0 || idx >= DAILY_SNACK_SLOTS) {
      continue
    }

    normalized[idx] = value === true
  }

  return normalized
}

export function normalizeDailyRoutineTrack(raw: unknown): DailyRoutineTrack {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    committed: source.committed === true,
    morningResetDone: source.morningResetDone === true,
    snacks: normalizeSnackChecks(source.snacks),
  }
}

function normalizeLogType(value: unknown, fallback: LogType = 'full'): LogType {
  return value === 'full' || value === 'core_only' || value === 'recovery_substitute' ? value : fallback
}

export function formatDateKey(date: Date = new Date(), timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'

  return `${year}-${month}-${day}`
}

export function todayDate(timeZone?: string) {
  return formatDateKey(new Date(), timeZone)
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day, 12)
}

export function trailingDateKeys(days: number, endDate: string): string[] {
  const base = parseDateKey(endDate)
  return Array.from({ length: days }, (_, idx) => {
    const d = new Date(base)
    d.setDate(base.getDate() - (days - 1 - idx))
    return formatDateKey(d)
  })
}

export function nextSessionNumber(current: number): number {
  return current === 4 ? 1 : current + 1
}

export function getRecommendation({
  selectedTier,
  backStatus,
  nextSession,
  energy,
}: {
  selectedTier: Tier
  backStatus: BackStatus
  nextSession: number
  energy: number
}): Recommendation {
  let adjustedTier: Tier = selectedTier
  let note = ''
  let sessionOverride: number | null = null
  let rotationAdvancedOnComplete = true
  let completionType: Exclude<LogType, 'core_only'> = 'full'

  if (backStatus === 'red') {
    adjustedTier = 'C'
    note = 'Flare-up mode: Core Base plus walking only. Skip heavy loading and deep bending for 48-72 hours.'
    if (nextSession === 3) {
      sessionOverride = 1
      rotationAdvancedOnComplete = false
      completionType = 'recovery_substitute'
      note += ' Lower day swaps to Session 1 today so you do not burn Session 3.'
    }
  } else if (backStatus === 'yellow') {
    if (selectedTier === 'A') adjustedTier = 'B'
    note = 'Caution day: keep pain <= 3/10 during and next day, no spreading symptoms, and cap effort around RPE 6.'
  } else {
    note =
      energy <= 2
        ? 'Low energy day: complete Core Base and walk. A core-only win still moves the week forward.'
        : 'Green light: earn lifting by finishing Core Base first, then run your selected tier.'
  }

  return {
    tier: adjustedTier,
    session: sessionOverride ?? nextSession,
    plannedSession: nextSession,
    note,
    severity: backStatus,
    rotationAdvancedOnComplete,
    completionType,
  }
}

export function uid() {
  return Math.random().toString(36).slice(2, 9)
}

export function makeWorkoutKey(localDate: string, week: number, plannedSession: number) {
  return `${localDate}-W${week}-P${plannedSession}`
}

export function blankSetRow(): SetRow {
  return { reps: '', load: '', rpe: '', done: false }
}

function normalizeRangeText(value: string) {
  return value.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, '')
}

export function inferRepsFromPrescription(prescription: string): string {
  if (!prescription.trim()) {
    return ''
  }

  const secondsMatch = prescription.match(/(\d+\s*(?:-|\u2013)\s*\d+|\d+)\s*(?:s|sec|seconds?)\b/i)
  if (secondsMatch?.[1]) {
    return `${normalizeRangeText(secondsMatch[1])}S`
  }

  const repsAfterX = prescription.match(/[x\u00D7]\s*([0-9]+(?:\s*(?:-|\u2013)\s*[0-9]+)?(?:\s*\+\s*[0-9]+)?)/i)
  if (repsAfterX?.[1]) {
    return normalizeRangeText(repsAfterX[1])
  }

  if (/\bsingle(s)?\b/i.test(prescription)) {
    return '1'
  }

  return ''
}

export function inferRpeFromPrescription(prescription: string): string {
  const rpeMatch = prescription.match(/RPE\s*([0-9]+(?:\s*(?:-|\u2013)\s*[0-9]+)?)/i)
  if (!rpeMatch?.[1]) {
    return ''
  }

  const normalized = normalizeRangeText(rpeMatch[1])
  return normalized.split('-')[0] ?? ''
}

export function inferLoad(exercise: Exercise): string {
  if (exercise.load.trim()) {
    return exercise.load.trim()
  }

  const text = `${exercise.name} ${exercise.prescription}`.toLowerCase()
  if (text.includes('bodyweight') || text.includes('bw')) {
    return 'BW'
  }

  return ''
}

export function prefilledSetFromTarget(exercise: Exercise): SetRow {
  return {
    reps: inferRepsFromPrescription(exercise.prescription),
    load: inferLoad(exercise),
    rpe: inferRpeFromPrescription(exercise.prescription),
    done: false,
  }
}

function normalizeLogEntry(raw: unknown, index: number): LogEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const source = raw as Record<string, unknown>
  const week = normalizeWeek(source.week, defaultState.week)
  const plannedSession = normalizeSessionNumber(source.plannedSession ?? source.session, defaultState.nextSession)
  const completedSession = normalizeSessionNumber(source.completedSession ?? source.session, plannedSession)
  const localDate =
    typeof source.localDate === 'string'
      ? source.localDate
      : typeof source.date === 'string'
        ? source.date
        : todayDate()
  const type =
    typeof source.type === 'string'
      ? normalizeLogType(source.type, source.completedSession !== undefined && completedSession !== plannedSession ? 'recovery_substitute' : 'full')
      : 'full'
  const workoutKey =
    typeof source.workoutKey === 'string' ? source.workoutKey : makeWorkoutKey(localDate, week, plannedSession)

  return {
    id: typeof source.id === 'string' ? source.id : `${workoutKey}-${index}`,
    workoutKey,
    localDate,
    week,
    type,
    plannedSession,
    completedSession,
    tier: normalizeTier(source.tier, 'C'),
    backStatus: normalizeBackStatus(source.backStatus, defaultState.backStatus),
    energy: normalizeEnergy(source.energy, defaultState.energy),
    exerciseSetCount: normalizeCount(source.exerciseSetCount),
    checklistCompleted: normalizeCount(source.checklistCompleted),
    rotationAdvanced:
      typeof source.rotationAdvanced === 'boolean'
        ? source.rotationAdvanced
        : type === 'full',
    note: typeof source.note === 'string' ? source.note : '',
  }
}

export function normalizeLoadedState(raw: Partial<AppState> | null | undefined): AppState {
  if (!raw) {
    return defaultState
  }

  const legacyMinutes = Number(raw.minutesAvailable || defaultState.minutesAvailable)
  const inferredTier = getTierFromTime(legacyMinutes)
  const timeTier = normalizeTier(raw.timeTier, inferredTier)
  const rawDailyRoutine = raw.dailyRoutineByDate ?? {}
  const dailyRoutineByDate = Object.fromEntries(
    Object.entries(rawDailyRoutine).map(([date, routine]) => [date, normalizeDailyRoutineTrack(routine)]),
  ) as Record<string, DailyRoutineTrack>
  const logs = Array.isArray(raw.logs)
    ? raw.logs
        .map((log, index) => normalizeLogEntry(log, index))
        .filter((log): log is LogEntry => log !== null)
        .slice(0, MAX_LOG_ENTRIES)
    : []

  return {
    ...defaultState,
    ...raw,
    week: normalizeWeek(raw.week, defaultState.week),
    nextSession: normalizeSessionNumber(raw.nextSession, defaultState.nextSession),
    backStatus: normalizeBackStatus(raw.backStatus, defaultState.backStatus),
    energy: normalizeEnergy(raw.energy, defaultState.energy),
    timeTier,
    minutesAvailable: minutesFromTier(timeTier),
    logs,
    dailyRoutineByDate,
    sessionConfigs: normalizeSessionConfigs(raw.sessionConfigs),
  }
}

export function countLoggedSets(setLogs: Record<string, SetRow[]>): number {
  return Object.values(setLogs).reduce((sum, rows) => sum + rows.length, 0)
}

export function findLogByWorkoutKey(logs: LogEntry[], workoutKey: string): LogEntry | null {
  return logs.find((log) => log.workoutKey === workoutKey) ?? null
}

export function upsertLogEntry(logs: LogEntry[], nextLog: LogEntry): LogEntry[] {
  const filtered = logs.filter((log) => log.workoutKey !== nextLog.workoutKey)
  return [nextLog, ...filtered].slice(0, MAX_LOG_ENTRIES)
}

export function getWeekStats(logs: LogEntry[], week: number): WeekStats {
  const weekLogs = logs.filter((log) => log.week === week)
  const wins = weekLogs.length
  const fullSessions = weekLogs.filter((log) => log.type === 'full').length
  const coreOnlyWins = weekLogs.filter((log) => log.type === 'core_only').length
  const recoverySubs = weekLogs.filter((log) => log.type === 'recovery_substitute').length

  return {
    wins,
    fullSessions,
    coreOnlyWins,
    recoverySubs,
    progress: Math.min(100, Math.round((wins / 4) * 100)),
  }
}

export function getLogTypeLabel(type: LogType) {
  if (type === 'core_only') return 'Core-only win'
  if (type === 'recovery_substitute') return 'Recovery substitution'
  return 'Full session'
}

export function getCompletionStatusLabel(log: LogEntry | null) {
  if (!log) {
    return 'Not logged yet'
  }

  return getLogTypeLabel(log.type)
}
