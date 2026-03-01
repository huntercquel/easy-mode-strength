import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import {
  CheckCircle2,
  Dumbbell,
  LogOut,
  Play,
  Plus,
  RotateCcw,
  Save,
  Timer,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SUPABASE_STATE_TABLE, isSupabaseConfigured, supabase } from '@/lib/supabase'

const LOCAL_CACHE_KEY = 'life-proof-strength-block-v2-cache'

type Tier = 'A' | 'B' | 'C'
type BackStatus = 'green' | 'yellow' | 'red'
type AuthMode = 'password' | 'otp'

interface Exercise {
  id: string
  name: string
  load: string
  prescription: string
}

interface SessionConfig {
  name: string
  focus: string
  exercises: Exercise[]
  tierC: string[]
  tierB: string[]
  tierA: string[]
}

interface SetRow {
  reps: string
  load: string
  rpe: string
  done: boolean
}

interface LogEntry {
  date: string
  week: number
  session: number
  tier: Tier
  backStatus: BackStatus
  energy: number
  minutesAvailable: number
  checklistCompleted: number
  mainLiftDone: boolean
  exerciseSetCount: number
  note: string
  workoutKey: string
}

interface DailyRoutineTrack {
  committed: boolean
  morningResetDone: boolean
  snacks: Record<number, boolean>
}

interface AppState {
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

interface Recommendation {
  tier: Tier
  session: number
  note: string
}

const tierToMinutesMap: Record<Tier, number> = {
  C: 30,
  B: 50,
  A: 80,
}

const tierDescriptions: Record<Tier, string> = {
  C: 'Tier C (25-35 min)',
  B: 'Tier B (45-60 min)',
  A: 'Tier A (75+ min)',
}

const DAILY_SNACK_SLOTS = 6

const defaultSessionConfigs: Record<number, SessionConfig> = {
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

function cloneSessionConfigs(configs: Record<number, SessionConfig>): Record<number, SessionConfig> {
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

function normalizeSessionConfigs(raw: Partial<Record<number, SessionConfig>> | undefined): Record<number, SessionConfig> {
  const merged = {
    ...cloneSessionConfigs(defaultSessionConfigs),
    ...(raw ?? {}),
  } as Record<number, SessionConfig>

  if (containsLegacyTemplateData(merged)) {
    return cloneSessionConfigs(defaultSessionConfigs)
  }

  return merged
}

const defaultState: AppState = {
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

function getTierFromTime(minutes: number): Tier {
  if (minutes >= 75) return 'A'
  if (minutes >= 45) return 'B'
  return 'C'
}

function minutesFromTier(tier: Tier) {
  return tierToMinutesMap[tier]
}

function normalizeTier(value: unknown, fallback: Tier = 'C'): Tier {
  return value === 'A' || value === 'B' || value === 'C' ? value : fallback
}

function makeDefaultSnackChecks(): Record<number, boolean> {
  const snacks: Record<number, boolean> = {}
  for (let idx = 0; idx < DAILY_SNACK_SLOTS; idx += 1) {
    snacks[idx] = false
  }
  return snacks
}

function normalizeSnackChecks(raw: unknown): Record<number, boolean> {
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

function normalizeDailyRoutineTrack(raw: unknown): DailyRoutineTrack {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    committed: source.committed === true,
    morningResetDone: source.morningResetDone === true,
    snacks: normalizeSnackChecks(source.snacks),
  }
}

function normalizeLoadedState(raw: Partial<AppState> | null | undefined): AppState {
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

  return {
    ...defaultState,
    ...raw,
    timeTier,
    minutesAvailable: minutesFromTier(timeTier),
    dailyRoutineByDate,
    sessionConfigs: normalizeSessionConfigs(raw.sessionConfigs),
  }
}

function nextSessionNumber(current: number): number {
  return current === 4 ? 1 : current + 1
}

function trailingDateKeys(days: number, endDate: string): string[] {
  const base = new Date(`${endDate}T12:00:00`)
  return Array.from({ length: days }, (_, idx) => {
    const d = new Date(base)
    d.setDate(base.getDate() - (days - 1 - idx))
    return d.toISOString().slice(0, 10)
  })
}

function getRecommendation({
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

  if (backStatus === 'red') {
    adjustedTier = 'C'
    note = 'Flare-up mode (48-72h): Tier C only. Do Core Base + walking. Skip heavy loading and deep bending.'
    if (nextSession === 3) {
      sessionOverride = 1
      note += ' Suggested swap to Session 1 today.'
    }
  } else if (backStatus === 'yellow') {
    if (selectedTier === 'A') adjustedTier = 'B'
    note = 'Caution day: keep pain <= 3/10 during and next day, no spreading symptoms, and cap effort around RPE 6.'
  } else {
    note =
      energy <= 2
        ? 'Low energy day: complete Core Base and walk. Tier C still counts as a full win.'
        : 'Green light: earn lifting by finishing Core Base first, then run your selected tier.'
  }

  return { tier: adjustedTier, session: sessionOverride ?? nextSession, note }
}

function uid() {
  return Math.random().toString(36).slice(2, 9)
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function makeWorkoutKey(state: AppState, rec: Recommendation) {
  return `${todayDate()}-W${state.week}-S${rec.session}-T${rec.tier}`
}

function blankSetRow(): SetRow {
  return { reps: '', load: '', rpe: '', done: false }
}

function normalizeRangeText(value: string) {
  return value.replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, '')
}

function inferRepsFromPrescription(prescription: string): string {
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

function inferRpeFromPrescription(prescription: string): string {
  const rpeMatch = prescription.match(/RPE\s*([0-9]+(?:\s*(?:-|\u2013)\s*[0-9]+)?)/i)
  if (!rpeMatch?.[1]) {
    return ''
  }

  const normalized = normalizeRangeText(rpeMatch[1])
  return normalized.split('-')[0] ?? ''
}

function inferLoad(exercise: Exercise): string {
  if (exercise.load.trim()) {
    return exercise.load.trim()
  }

  const text = `${exercise.name} ${exercise.prescription}`.toLowerCase()
  if (text.includes('bodyweight') || text.includes('bw')) {
    return 'BW'
  }

  return ''
}

function prefilledSetFromTarget(exercise: Exercise): SetRow {
  return {
    reps: inferRepsFromPrescription(exercise.prescription),
    load: inferLoad(exercise),
    rpe: inferRpeFromPrescription(exercise.prescription),
    done: false,
  }
}

function readCachedState(): AppState | null {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    if (!raw) {
      return null
    }

    return normalizeLoadedState(JSON.parse(raw) as Partial<AppState>)
  } catch (error) {
    console.error(error)
    return null
  }
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readCachedState() ?? defaultState)
  const [activeTab, setActiveTab] = useState('do')

  const [session, setSession] = useState<Session | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('password')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthLoading, setIsAuthLoading] = useState(() => isSupabaseConfigured)
  const [isStateLoaded, setIsStateLoaded] = useState(() => !isSupabaseConfigured)
  const [isSyncing, setIsSyncing] = useState(false)

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const cached = readCachedState()

    if (!isSupabaseConfigured || !supabase) {
      return
    }
    const client = supabase

    let active = true

    const hydrateState = async (currentSession: Session) => {
      setIsStateLoaded(false)

      const { data, error } = await client
        .from(SUPABASE_STATE_TABLE)
        .select('state')
        .eq('user_id', currentSession.user.id)
        .maybeSingle()

      if (!active) {
        return
      }

      if (error && error.code !== 'PGRST116') {
        console.error(error)
        setAuthMessage('Connected, but could not load cloud state. Check table name/policies.')
      }

      const remoteState = (data?.state as Partial<AppState> | null) ?? null
      const nextState = remoteState ? normalizeLoadedState(remoteState) : (cached ?? defaultState)

      setState(nextState)
      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(nextState))
      setIsStateLoaded(true)
    }

    const init = async () => {
      const {
        data: { session: currentSession },
        error,
      } = await client.auth.getSession()

      if (!active) {
        return
      }

      if (error) {
        console.error(error)
        setAuthMessage('Unable to initialize authentication.')
      }

      setSession(currentSession)
      setIsAuthLoading(false)

      if (currentSession) {
        await hydrateState(currentSession)
      } else {
        setState(cached ?? defaultState)
        setIsStateLoaded(true)
      }
    }

    void init()

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return
      }

      setSession(nextSession)
      setAuthMessage('')

      if (nextSession) {
        void hydrateState(nextSession)
      } else {
        const fallback = readCachedState() ?? defaultState
        setState(fallback)
        setIsStateLoaded(true)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isStateLoaded) {
      return
    }

    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state))

    if (!isSupabaseConfigured || !supabase || !session) {
      return
    }
    const client = supabase

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      void (async () => {
        setIsSyncing(true)

        const { error } = await client.from(SUPABASE_STATE_TABLE).upsert(
          {
            user_id: session.user.id,
            state,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

        if (error) {
          console.error(error)
          setAuthMessage('Could not sync to cloud. Check table schema and RLS policy.')
        }

        setIsSyncing(false)
      })()
    }, 350)

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [state, isStateLoaded, session])

  const recommendation = useMemo(
    () =>
      getRecommendation({
        selectedTier: state.timeTier,
        backStatus: state.backStatus,
        nextSession: state.nextSession,
        energy: state.energy,
      }),
    [state.timeTier, state.backStatus, state.nextSession, state.energy],
  )

  const workoutKey = makeWorkoutKey(state, recommendation)
  const activeSessionConfig = state.sessionConfigs[recommendation.session]
  const checklist = state.checksByKey[workoutKey] || {}
  const setLogs = state.setLogsByKey[workoutKey] || {}
  const today = todayDate()

  const weekLogs = state.logs.filter((log) => log.week === state.week)
  const weekProgress = Math.min(100, (weekLogs.length / 4) * 100)
  const coreCount = Object.values(state.coreDays).filter(Boolean).length

  const tierKey: 'tierA' | 'tierB' | 'tierC' =
    recommendation.tier === 'A' ? 'tierA' : recommendation.tier === 'B' ? 'tierB' : 'tierC'
  const tierRules = activeSessionConfig[tierKey] || []
  const coreBaseExercises = activeSessionConfig.exercises.slice(0, 3)
  const todayRoutine = normalizeDailyRoutineTrack(state.dailyRoutineByDate[today])
  const snacksDone = Object.values(todayRoutine.snacks).filter(Boolean).length
  const weeklySummary = useMemo(() => {
    const dates = trailingDateKeys(7, today)
    let committedDays = 0
    let morningResetDays = 0
    let snackCount = 0
    let snackDaysAtLeastThree = 0

    for (const date of dates) {
      const routine = normalizeDailyRoutineTrack(state.dailyRoutineByDate[date])
      if (routine.committed) {
        committedDays += 1
      }
      if (routine.morningResetDone) {
        morningResetDays += 1
      }

      const daySnackCount = Object.values(routine.snacks).filter(Boolean).length
      snackCount += daySnackCount
      if (daySnackCount >= 3) {
        snackDaysAtLeastThree += 1
      }
    }

    return {
      committedDays,
      morningResetDays,
      snackCount,
      snackDaysAtLeastThree,
      commitProgress: Math.round((committedDays / 7) * 100),
      morningProgress: Math.round((morningResetDays / 7) * 100),
      snackProgress: Math.min(100, Math.round((snackCount / 21) * 100)),
    }
  }, [state.dailyRoutineByDate, today])

  const updateState = (patch: Partial<AppState>) => setState((current) => ({ ...current, ...patch }))

  const selectTimeTier = (tier: Tier) => {
    updateState({
      timeTier: tier,
      minutesAvailable: minutesFromTier(tier),
    })
  }

  const updateSessionConfig = (sessionNum: number, updater: (cfg: SessionConfig) => SessionConfig) => {
    setState((current) => {
      const existing = current.sessionConfigs[sessionNum] ?? defaultSessionConfigs[sessionNum]
      return {
        ...current,
        sessionConfigs: {
          ...current.sessionConfigs,
          [sessionNum]: updater(existing),
        },
      }
    })
  }

  const toggleChecklistItem = (idx: number) => {
    setState((current) => ({
      ...current,
      checksByKey: {
        ...current.checksByKey,
        [workoutKey]: {
          ...(current.checksByKey[workoutKey] || {}),
          [idx]: !(current.checksByKey[workoutKey] || {})[idx],
        },
      },
    }))
  }

  const updateExerciseField = (
    sessionNum: number,
    exerciseId: string,
    field: keyof Pick<Exercise, 'name' | 'load' | 'prescription'>,
    value: string,
  ) => {
    updateSessionConfig(sessionNum, (cfg) => ({
      ...cfg,
      exercises: cfg.exercises.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, [field]: value } : exercise,
      ),
    }))
  }

  const addExercise = (sessionNum: number) => {
    updateSessionConfig(sessionNum, (cfg) => ({
      ...cfg,
      exercises: [...cfg.exercises, { id: `ex_${uid()}`, name: 'New Exercise', load: '', prescription: '' }],
    }))
  }

  const removeExercise = (sessionNum: number, exerciseId: string) => {
    updateSessionConfig(sessionNum, (cfg) => ({
      ...cfg,
      exercises: cfg.exercises.filter((exercise) => exercise.id !== exerciseId),
    }))
  }

  const addSetRow = (exercise: Exercise) => {
    setState((current) => {
      const workoutSets = { ...(current.setLogsByKey[workoutKey] || {}) }
      const existingRows = [...(workoutSets[exercise.id] || [])]

      const nextRow =
        existingRows.length === 0
          ? prefilledSetFromTarget(exercise)
          : { ...existingRows[existingRows.length - 1], done: false }

      workoutSets[exercise.id] = [...existingRows, nextRow]

      return {
        ...current,
        setLogsByKey: {
          ...current.setLogsByKey,
          [workoutKey]: workoutSets,
        },
      }
    })
  }

  const updateSetRow = (exerciseId: string, setIndex: number, field: keyof SetRow, value: string | boolean) => {
    setState((current) => {
      const workoutSets = { ...(current.setLogsByKey[workoutKey] || {}) }
      const rows = [...(workoutSets[exerciseId] || [])]
      const existing = rows[setIndex] ?? blankSetRow()
      rows[setIndex] = { ...existing, [field]: value } as SetRow
      workoutSets[exerciseId] = rows

      return {
        ...current,
        setLogsByKey: {
          ...current.setLogsByKey,
          [workoutKey]: workoutSets,
        },
      }
    })
  }

  const removeSetRow = (exerciseId: string, setIndex: number) => {
    setState((current) => {
      const workoutSets = { ...(current.setLogsByKey[workoutKey] || {}) }
      workoutSets[exerciseId] = (workoutSets[exerciseId] || []).filter((_, index) => index !== setIndex)

      return {
        ...current,
        setLogsByKey: {
          ...current.setLogsByKey,
          [workoutKey]: workoutSets,
        },
      }
    })
  }

  const clearTodayChecks = () => {
    setState((current) => ({
      ...current,
      checksByKey: { ...current.checksByKey, [workoutKey]: {} },
    }))
  }

  const updateTodayRoutine = (updater: (routine: DailyRoutineTrack) => DailyRoutineTrack) => {
    const day = todayDate()
    setState((current) => {
      const existing = normalizeDailyRoutineTrack(current.dailyRoutineByDate[day])
      return {
        ...current,
        dailyRoutineByDate: {
          ...current.dailyRoutineByDate,
          [day]: updater(existing),
        },
      }
    })
  }

  const toggleDailyCommit = () => {
    updateTodayRoutine((routine) => ({ ...routine, committed: !routine.committed }))
  }

  const toggleMorningReset = () => {
    updateTodayRoutine((routine) => ({ ...routine, morningResetDone: !routine.morningResetDone }))
  }

  const toggleSnackSlot = (slot: number) => {
    updateTodayRoutine((routine) => ({
      ...routine,
      snacks: { ...routine.snacks, [slot]: !routine.snacks[slot] },
    }))
  }

  const markNextSnack = () => {
    updateTodayRoutine((routine) => {
      const nextSlot = Array.from({ length: DAILY_SNACK_SLOTS }, (_, idx) => idx).find((idx) => !routine.snacks[idx])
      if (nextSlot === undefined) {
        return routine
      }

      return {
        ...routine,
        snacks: { ...routine.snacks, [nextSlot]: true },
      }
    })
  }

  const clearSnacks = () => {
    updateTodayRoutine((routine) => ({ ...routine, snacks: makeDefaultSnackChecks() }))
  }

  const markCoreDay = () => {
    const day = todayDate()
    setState((current) => ({
      ...current,
      coreDays: { ...current.coreDays, [day]: !current.coreDays[day] },
    }))
  }

  const completeSession = () => {
    const checkCount = Object.values(checklist).filter(Boolean).length
    const exerciseSetCount = Object.values(setLogs).reduce((sum, rows) => sum + rows.length, 0)
    const day = todayDate()
    const logEntry: LogEntry = {
      date: day,
      week: state.week,
      session: recommendation.session,
      tier: recommendation.tier,
      backStatus: state.backStatus,
      energy: state.energy,
      minutesAvailable: minutesFromTier(state.timeTier),
      checklistCompleted: checkCount,
      mainLiftDone: checkCount >= 1,
      exerciseSetCount,
      note: (state.notes || '').trim(),
      workoutKey,
    }

    setState((current) => ({
      ...current,
      logs: [logEntry, ...current.logs].slice(0, 120),
      nextSession: nextSessionNumber(current.nextSession),
      notes: '',
      coreDays: { ...current.coreDays, [day]: true },
      dailyRoutineByDate: {
        ...current.dailyRoutineByDate,
        [day]: {
          ...normalizeDailyRoutineTrack(current.dailyRoutineByDate[day]),
          committed: true,
        },
      },
    }))
  }

  const resetBlock = () => {
    setState(defaultState)
    setActiveTab('do')
  }

  const resetSessionTemplatesToCoreFirst = () => {
    setState((current) => ({
      ...current,
      sessionConfigs: cloneSessionConfigs(defaultSessionConfigs),
    }))
  }

  const signInWithPassword = async () => {
    if (!supabase) {
      return
    }

    setAuthMessage('')

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail.trim(),
      password: authPassword,
    })

    if (error) {
      setAuthMessage(error.message)
    }
  }

  const signUpWithPassword = async () => {
    if (!supabase) {
      return
    }

    setAuthMessage('')

    const { error } = await supabase.auth.signUp({
      email: authEmail.trim(),
      password: authPassword,
    })

    if (error) {
      setAuthMessage(error.message)
      return
    }

    setAuthMessage('Account created. Check your email if confirmation is enabled.')
  }

  const sendMagicLink = async () => {
    if (!supabase) {
      return
    }

    setAuthMessage('')

    const { error } = await supabase.auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: window.location.origin,
      },
    })

    if (error) {
      setAuthMessage(error.message)
      return
    }

    setAuthMessage('Magic link sent. Open the email on this device.')
  }

  const signOut = async () => {
    if (!supabase) {
      return
    }

    const { error } = await supabase.auth.signOut()

    if (error) {
      setAuthMessage(error.message)
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Supabase Setup Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>This build now requires Supabase for authentication and cloud persistence.</p>
              <p>
                Add these environment variables and restart dev server: <code>VITE_SUPABASE_URL</code>,{' '}
                <code>VITE_SUPABASE_ANON_KEY</code>.
              </p>
              <p>
                Optional table override: <code>VITE_SUPABASE_STATE_TABLE</code> (default: <code>training_state</code>).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Loading...</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">Initializing authentication.</CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-md">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <p className="text-sm text-slate-600">Use email + password or email magic link.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label>Auth mode</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={authMode === 'password' ? 'default' : 'outline'}
                    className="rounded-xl"
                    onClick={() => setAuthMode('password')}
                  >
                    Email + Password
                  </Button>
                  <Button
                    type="button"
                    variant={authMode === 'otp' ? 'default' : 'outline'}
                    className="rounded-xl"
                    onClick={() => setAuthMode('otp')}
                  >
                    Email OTP
                  </Button>
                </div>
              </div>

              {authMode === 'password' ? (
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {authMode === 'password' ? (
                  <>
                    <Button className="rounded-xl" onClick={signInWithPassword}>
                      Sign in
                    </Button>
                    <Button variant="outline" className="rounded-xl" onClick={signUpWithPassword}>
                      Create account
                    </Button>
                  </>
                ) : (
                  <Button className="rounded-xl" onClick={sendMagicLink}>
                    Send magic link
                  </Button>
                )}
              </div>

              {authMessage ? <p className="text-sm text-slate-600">{authMessage}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (!isStateLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-2xl">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle>Loading Training Data...</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">Reading your latest state from Supabase.</CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-xl md:text-2xl">
                <span className="flex items-center gap-2">
                  <Dumbbell className="h-5 w-5" /> Life-Proof Strength Core-First
                </span>
                <Badge variant="secondary">Week {state.week} / 4</Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">Earn the right to lift: Core Base first. Tier work is bonus.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white p-3 text-sm">
                <div className="text-slate-700">
                  Signed in as <b>{session.user.email}</b>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{isSyncing ? 'Syncing...' : 'Cloud sync on'}</span>
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" /> Sign out
                  </Button>
                </div>
              </div>

              {authMessage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  {authMessage}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>How much time do I have?</Label>
                  <div className="flex flex-wrap gap-2">
                    {(['C', 'B', 'A'] as Tier[]).map((tier) => (
                      <Button
                        key={tier}
                        type="button"
                        variant={state.timeTier === tier ? 'default' : 'outline'}
                        className="rounded-xl"
                        onClick={() => selectTimeTier(tier)}
                      >
                        {tierDescriptions[tier]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Tap one option. No numeric entry needed.</p>
                </div>
                <div className="space-y-2">
                  <Label>Back status</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['green', 'Green'],
                      ['yellow', 'Yellow'],
                      ['red', 'Red'],
                    ].map(([key, label]) => (
                      <Button
                        key={key}
                        type="button"
                        variant={state.backStatus === key ? 'default' : 'outline'}
                        className="rounded-xl"
                        onClick={() => updateState({ backStatus: key as BackStatus })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Energy (1-5)</Label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={state.energy === n ? 'default' : 'outline'}
                        className="h-9 w-9 rounded-full p-0"
                        onClick={() => updateState({ energy: n })}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Next session in rotation</Label>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3, 4].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={state.nextSession === n ? 'default' : 'outline'}
                        className="rounded-xl"
                        onClick={() => updateState({ nextSession: n })}
                      >
                        S{n}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">Win condition</div>
                    <div className="text-sm text-slate-600">4 Core Bases/week + daily morning reset + movement snacks</div>
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => updateState({ week: state.week >= 4 ? 1 : state.week + 1, coreDays: {} })}
                  >
                    Advance Week
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Sessions this week (target 4)</span>
                    <span>{Math.round(weekProgress)}%</span>
                  </div>
                  <Progress value={weekProgress} />
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Core Base days (target 4)</span>
                    <span>{coreCount}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-3">
                <div className="text-sm font-medium text-slate-900">Weekly Routine Summary (last 7 days)</div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Committed days (target 7)</span>
                    <span>{weeklySummary.committedDays}/7</span>
                  </div>
                  <Progress value={weeklySummary.commitProgress} />

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Morning resets (target 7)</span>
                    <span>{weeklySummary.morningResetDays}/7</span>
                  </div>
                  <Progress value={weeklySummary.morningProgress} />

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Movement snacks (baseline target 21)</span>
                    <span>{weeklySummary.snackCount}/21</span>
                  </div>
                  <Progress value={weeklySummary.snackProgress} />

                  <div className="text-xs text-slate-500">
                    Days with 3+ snacks: {weeklySummary.snackDaysAtLeastThree}/7
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl">
            <TabsTrigger value="do">Do Workout</TabsTrigger>
            <TabsTrigger value="log">Set/Rep Log</TabsTrigger>
            <TabsTrigger value="edit">Edit Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="do" className="space-y-4">
            <Card className="rounded-2xl border-2 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                  <Play className="h-5 w-5" /> Today&apos;s Recommendation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-slate-500">Workout</div>
                    <div className="font-semibold">{activeSessionConfig.name}</div>
                    <div className="text-sm text-slate-600">{activeSessionConfig.focus}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-slate-500">Tier</div>
                    <div className="font-semibold">Tier {recommendation.tier}</div>
                    <div className="text-sm text-slate-600">Based on {tierDescriptions[state.timeTier]}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-slate-500">Decision note</div>
                    <div className="text-sm font-medium text-slate-800">{recommendation.note}</div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-3">
                  <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                    Non-negotiable: morning reset daily + session Core Base first. Pain rule: stay at &lt;= 3/10 during
                    and next day with no spreading symptoms. No RDLs for now.
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-medium">Tier guidance</div>
                    <Button variant="ghost" size="sm" onClick={clearTodayChecks}>
                      Clear checks
                    </Button>
                  </div>
                  <div className="mb-3 space-y-2">
                    {tierRules.map((rule, idx) => (
                      <div key={idx} className="flex items-start gap-3 rounded-lg border p-2">
                        <Checkbox checked={!!checklist[idx]} onCheckedChange={() => toggleChecklistItem(idx)} />
                        <div className="text-sm leading-5">{rule}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mb-2 text-sm font-medium">Today's exercise plan (from your editable session template)</div>
                  <div className="space-y-2">
                    {activeSessionConfig.exercises.map((exercise) => (
                      <div key={exercise.id} className="rounded-lg border p-2">
                        <div className="text-sm font-medium">{exercise.name}</div>
                        <div className="text-xs text-slate-600">
                          {exercise.load ? `Load target: ${exercise.load} · ` : ''}
                          {exercise.prescription || 'No prescription set'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <div className="mb-2 flex items-center gap-2 font-medium">
                      <Timer className="h-4 w-4" /> Session Core Base (required)
                    </div>
                    <div className="space-y-1 text-sm text-slate-700">
                      {coreBaseExercises.map((exercise) => (
                        <div key={exercise.id}>- {exercise.name}: {exercise.prescription}</div>
                      ))}
                    </div>
                    <Button
                      className="mt-3 rounded-xl"
                      variant={state.coreDays[today] ? 'default' : 'outline'}
                      onClick={markCoreDay}
                    >
                      {state.coreDays[today] ? 'Core Base logged' : 'Log Core Base'}
                    </Button>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="font-medium">Daily morning + snack tracker</div>
                      <Button
                        size="sm"
                        variant={todayRoutine.committed ? 'default' : 'outline'}
                        className="rounded-xl"
                        onClick={toggleDailyCommit}
                      >
                        {todayRoutine.committed ? 'Committed today' : 'Commit today'}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 rounded-lg border p-2">
                        <Checkbox checked={todayRoutine.morningResetDone} onCheckedChange={toggleMorningReset} />
                        <span className="text-sm">Morning stiffness reset done (3-6 min)</span>
                      </label>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                      <span>Movement snacks today</span>
                      <span>
                        {snacksDone}/{DAILY_SNACK_SLOTS}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {Array.from({ length: DAILY_SNACK_SLOTS }, (_, idx) => (
                        <label key={idx} className="flex items-center gap-2 rounded-lg border p-2">
                          <Checkbox checked={todayRoutine.snacks[idx]} onCheckedChange={() => toggleSnackSlot(idx)} />
                          <span className="text-sm">Snack {idx + 1}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={markNextSnack}>
                        Mark next snack
                      </Button>
                      <Button size="sm" variant="ghost" className="rounded-xl" onClick={clearSnacks}>
                        Clear snacks
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border p-3">
                    <Label htmlFor="notes">Quick notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={state.notes}
                      onChange={(event) => updateState({ notes: event.target.value })}
                      placeholder="e.g. Pull-ups felt smooth. Back yellow but okay after warm-up."
                      className="min-h-[120px]"
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={completeSession} className="rounded-xl">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Complete session & advance rotation
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={markCoreDay}>
                    Log Core Base only day
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={resetBlock}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Reset block
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log" className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Exact Set/Rep Logging for Today</CardTitle>
                <p className="text-sm text-slate-600">Workout key: {workoutKey}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeSessionConfig.exercises.map((exercise) => {
                  const rows = setLogs[exercise.id] || []
                  return (
                    <div key={exercise.id} className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{exercise.name}</div>
                          <div className="text-xs text-slate-600">
                            Target load: {exercise.load || '-'} · {exercise.prescription || '-'}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => addSetRow(exercise)}>
                          <Plus className="mr-1 h-4 w-4" /> Add set
                        </Button>
                      </div>

                      {rows.length === 0 ? (
                        <div className="text-sm text-slate-500">No sets logged yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {rows.map((row, i) => (
                            <div key={i} className="grid grid-cols-12 items-center gap-2 rounded-lg border p-2">
                              <div className="col-span-12 text-xs text-slate-500 sm:col-span-1">Set {i + 1}</div>
                              <div className="col-span-4 sm:col-span-2">
                                <Label className="text-xs">Reps</Label>
                                <Input
                                  value={row.reps}
                                  onChange={(event) => updateSetRow(exercise.id, i, 'reps', event.target.value)}
                                  placeholder="e.g. 5 or 30S"
                                />
                              </div>
                              <div className="col-span-4 sm:col-span-3">
                                <Label className="text-xs">Load</Label>
                                <Input
                                  value={row.load}
                                  onChange={(event) => updateSetRow(exercise.id, i, 'load', event.target.value)}
                                  placeholder="e.g. +12.5kg or BW"
                                />
                              </div>
                              <div className="col-span-4 sm:col-span-2">
                                <Label className="text-xs">RPE</Label>
                                <Input
                                  value={row.rpe}
                                  onChange={(event) => updateSetRow(exercise.id, i, 'rpe', event.target.value)}
                                  placeholder="6"
                                />
                              </div>
                              <div className="col-span-8 flex items-center gap-2 pt-5 sm:col-span-2 sm:pt-0">
                                <Checkbox
                                  checked={row.done}
                                  onCheckedChange={(checked) => updateSetRow(exercise.id, i, 'done', checked === true)}
                                />
                                <span className="text-sm">Done</span>
                              </div>
                              <div className="col-span-4 flex justify-end pt-5 sm:col-span-2 sm:pt-0">
                                <Button size="icon" variant="ghost" onClick={() => removeSetRow(exercise.id, i)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}

                <div className="rounded-xl border p-3 text-sm text-slate-600">
                  New sets auto-prefill from target on set 1, then copy your previous set values on next adds. Reps can be
                  text (example: <b>30S</b>) and bodyweight load can be <b>BW</b>.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Save className="h-4 w-4" /> Edit session templates (exercise names + loads)
                  </CardTitle>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={resetSessionTemplatesToCoreFirst}>
                    Reset to core-first defaults
                  </Button>
                </div>
                <p className="text-sm text-slate-600">Changes save automatically to Supabase.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4].map((sessionNum) => {
                  const sessionConfig = state.sessionConfigs[sessionNum]
                  return (
                    <div key={sessionNum} className="space-y-3 rounded-xl border p-3">
                      <div className="font-medium">
                        S{sessionNum}: {sessionConfig.name}
                      </div>
                      <div className="text-xs text-slate-600">{sessionConfig.focus}</div>

                      <div className="space-y-3">
                        {sessionConfig.exercises.map((exercise) => (
                          <div
                            key={exercise.id}
                            className="grid grid-cols-1 items-start gap-2 rounded-lg border p-3 md:grid-cols-12"
                          >
                            <div className="md:col-span-4">
                              <Label className="text-xs">Exercise name</Label>
                              <Input
                                value={exercise.name}
                                onChange={(event) =>
                                  updateExerciseField(sessionNum, exercise.id, 'name', event.target.value)
                                }
                              />
                            </div>
                            <div className="md:col-span-3">
                              <Label className="text-xs">Default load</Label>
                              <Input
                                value={exercise.load}
                                onChange={(event) =>
                                  updateExerciseField(sessionNum, exercise.id, 'load', event.target.value)
                                }
                                placeholder="BW / +10 kg"
                              />
                            </div>
                            <div className="md:col-span-4">
                              <Label className="text-xs">Prescription</Label>
                              <Input
                                value={exercise.prescription}
                                onChange={(event) =>
                                  updateExerciseField(sessionNum, exercise.id, 'prescription', event.target.value)
                                }
                                placeholder="e.g. 4 x 5 @ RPE 6"
                              />
                            </div>
                            <div className="flex pt-5 md:col-span-1 md:justify-end">
                              <Button variant="ghost" size="icon" onClick={() => removeExercise(sessionNum, exercise.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => addExercise(sessionNum)}
                      >
                        <Plus className="mr-1 h-4 w-4" /> Add exercise to S{sessionNum}
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Recent Log</CardTitle>
            </CardHeader>
            <CardContent>
              {state.logs.length === 0 ? (
                <div className="text-sm text-slate-600">No sessions logged yet. Your first Tier C counts.</div>
              ) : (
                <div className="space-y-2">
                  {state.logs.slice(0, 10).map((log, idx) => (
                    <div key={idx} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{log.date}</Badge>
                        <Badge>W{log.week}</Badge>
                        <Badge variant="secondary">S{log.session}</Badge>
                        <Badge variant="secondary">Tier {log.tier}</Badge>
                        <Badge variant="outline">Back: {log.backStatus}</Badge>
                        <Badge variant="outline">Energy: {log.energy}</Badge>
                      </div>
                      <div className="mt-2 text-slate-700">
                        {log.mainLiftDone ? 'Session done' : 'Partial'} · {log.minutesAvailable} min ·{' '}
                        {log.checklistCompleted} checks · {log.exerciseSetCount || 0} sets logged
                      </div>
                      {log.note ? <div className="mt-1 text-slate-600">"{log.note}"</div> : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
