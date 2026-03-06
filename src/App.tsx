import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import { CheckCircle2, Dumbbell, LogOut, Play, Plus, RotateCcw, Save, Timer, Trash2 } from 'lucide-react'

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
import {
  DAILY_SNACK_SLOTS,
  blankSetRow,
  cloneSessionConfigs,
  countLoggedSets,
  defaultSessionConfigs,
  defaultState,
  findLogByWorkoutKey,
  getCompletionStatusLabel,
  getLogTypeLabel,
  getRecommendation,
  getWeekStats,
  makeDefaultSnackChecks,
  makeWorkoutKey,
  minutesFromTier,
  nextSessionNumber,
  normalizeDailyRoutineTrack,
  normalizeLoadedState,
  prefilledSetFromTarget,
  tierDescriptions,
  todayDate,
  trailingDateKeys,
  uid,
  upsertLogEntry,
} from '@/lib/training-state'
import type {
  AppState,
  AuthMode,
  BackStatus,
  Exercise,
  LogEntry,
  LogType,
  SessionConfig,
  SetRow,
  Tier,
} from '@/lib/training-state'

const LOCAL_CACHE_KEY = 'life-proof-strength-block-v2-cache'

const backStatusThemes: Record<BackStatus, { badge: string; panel: string; note: string }> = {
  green: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    panel: 'border-emerald-200 bg-emerald-50/70',
    note: 'Green light',
  },
  yellow: {
    badge: 'border-amber-200 bg-amber-50 text-amber-900',
    panel: 'border-amber-200 bg-amber-50/70',
    note: 'Caution day',
  },
  red: {
    badge: 'border-rose-200 bg-rose-50 text-rose-900',
    panel: 'border-rose-200 bg-rose-50/70',
    note: 'Recovery mode',
  },
}

const logTypeThemes: Record<LogType, { badge: string; panel: string }> = {
  full: {
    badge: 'border-sky-200 bg-sky-50 text-sky-900',
    panel: 'border-sky-200 bg-sky-50/70',
  },
  core_only: {
    badge: 'border-teal-200 bg-teal-50 text-teal-900',
    panel: 'border-teal-200 bg-teal-50/70',
  },
  recovery_substitute: {
    badge: 'border-rose-200 bg-rose-50 text-rose-900',
    panel: 'border-rose-200 bg-rose-50/70',
  },
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

function getTodayStatus(log: LogEntry | null, hasPartialWorkoutData: boolean, hasRoutineData: boolean) {
  if (log) {
    return {
      label: getCompletionStatusLabel(log),
      detail:
        log.type === 'core_only'
          ? 'You banked a win without advancing the rotation.'
          : 'Today is closed out and saved in history.',
      className: logTypeThemes[log.type].badge,
    }
  }

  if (hasPartialWorkoutData || hasRoutineData) {
    return {
      label: 'In progress',
      detail: 'You have partial data today. Finish the session or save a core-only win.',
      className: 'border-slate-200 bg-slate-100 text-slate-800',
    }
  }

  return {
    label: 'Open',
    detail: 'No win logged yet today.',
    className: 'border-slate-200 bg-white text-slate-700',
  }
}

function describeHistoryLog(log: LogEntry) {
  if (log.type === 'core_only') {
    return `Held S${log.plannedSession} in place and saved a core-only win`
  }

  if (log.type === 'recovery_substitute') {
    return `Planned S${log.plannedSession}, completed S${log.completedSession} as a recovery substitute`
  }

  return `Completed S${log.completedSession} and advanced the rotation`
}

export default function App() {
  const [state, setState] = useState<AppState>(() => readCachedState() ?? defaultState)
  const [activeTab, setActiveTab] = useState('today')

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
        setAuthMessage('Connected, but could not load cloud state. Check table name and policies.')
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

  const today = todayDate()
  const workoutKey = makeWorkoutKey(today, state.week, recommendation.plannedSession)
  const activeSessionConfig = state.sessionConfigs[recommendation.session]
  const checklist = state.checksByKey[workoutKey] || {}
  const setLogs = state.setLogsByKey[workoutKey] || {}
  const coreBaseExercises = activeSessionConfig.exercises.slice(0, 3)
  const todayRoutine = normalizeDailyRoutineTrack(state.dailyRoutineByDate[today])
  const snacksDone = Object.values(todayRoutine.snacks).filter(Boolean).length
  const weekStats = useMemo(() => getWeekStats(state.logs, state.week), [state.logs, state.week])
  const todayLog = useMemo(() => state.logs.find((log) => log.localDate === today) ?? null, [state.logs, today])

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

  const hasPartialWorkoutData =
    Boolean(state.coreDays[today]) || Object.values(checklist).some(Boolean) || countLoggedSets(setLogs) > 0
  const hasRoutineData = todayRoutine.committed || todayRoutine.morningResetDone || snacksDone > 0
  const todayStatus = getTodayStatus(todayLog, hasPartialWorkoutData, hasRoutineData)

  const dayHasClosedWin = todayLog !== null && todayLog.type !== 'core_only'
  const canUpgradeCoreOnly = todayLog?.type === 'core_only' && todayLog.workoutKey === workoutKey

  const tierKey: 'tierA' | 'tierB' | 'tierC' =
    recommendation.tier === 'A' ? 'tierA' : recommendation.tier === 'B' ? 'tierB' : 'tierC'
  const tierRules = activeSessionConfig[tierKey] || []

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

  const updateTodayRoutine = (updater: (routine: { committed: boolean; morningResetDone: boolean; snacks: Record<number, boolean> }) => { committed: boolean; morningResetDone: boolean; snacks: Record<number, boolean> }) => {
    setState((current) => {
      const existing = normalizeDailyRoutineTrack(current.dailyRoutineByDate[today])
      return {
        ...current,
        dailyRoutineByDate: {
          ...current.dailyRoutineByDate,
          [today]: updater(existing),
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

  const toggleCoreDay = () => {
    setState((current) => ({
      ...current,
      coreDays: { ...current.coreDays, [today]: !current.coreDays[today] },
    }))
  }

  const completeSession = () => {
    const actionDate = today
    const actionWorkoutKey = workoutKey
    const actionRecommendation = recommendation
    const actionCheckCount = Object.values(checklist).filter(Boolean).length
    const actionExerciseSetCount = countLoggedSets(setLogs)
    const actionNote = state.notes.trim()
    const actionWeek = state.week
    const actionBackStatus = state.backStatus
    const actionEnergy = state.energy

    setState((current) => {
      const existingLog = findLogByWorkoutKey(current.logs, actionWorkoutKey)
      const existingTodayLog = current.logs.find((log) => log.localDate === actionDate) ?? null
      if (existingTodayLog && existingTodayLog.workoutKey !== actionWorkoutKey) {
        return current
      }
      if (existingLog?.type === 'full' || existingLog?.type === 'recovery_substitute') {
        return current
      }

      const nextLog: LogEntry = {
        id: existingLog?.id ?? `${actionWorkoutKey}-${uid()}`,
        workoutKey: actionWorkoutKey,
        localDate: actionDate,
        week: actionWeek,
        type: actionRecommendation.completionType,
        plannedSession: actionRecommendation.plannedSession,
        completedSession: actionRecommendation.session,
        tier: actionRecommendation.tier,
        backStatus: actionBackStatus,
        energy: actionEnergy,
        exerciseSetCount: actionExerciseSetCount,
        checklistCompleted: actionCheckCount,
        rotationAdvanced: actionRecommendation.rotationAdvancedOnComplete,
        note: actionNote,
      }

      const shouldAdvance = nextLog.rotationAdvanced && !existingLog?.rotationAdvanced

      return {
        ...current,
        logs: upsertLogEntry(current.logs, nextLog),
        nextSession: shouldAdvance ? nextSessionNumber(current.nextSession) : current.nextSession,
        notes: '',
        coreDays: { ...current.coreDays, [actionDate]: true },
        dailyRoutineByDate: {
          ...current.dailyRoutineByDate,
          [actionDate]: {
            ...normalizeDailyRoutineTrack(current.dailyRoutineByDate[actionDate]),
            committed: true,
          },
        },
      }
    })
  }

  const saveCoreOnlyWin = () => {
    const actionDate = today
    const actionWorkoutKey = workoutKey
    const actionRecommendation = recommendation
    const actionCheckCount = Object.values(checklist).filter(Boolean).length
    const actionExerciseSetCount = countLoggedSets(setLogs)
    const actionNote = state.notes.trim()
    const actionWeek = state.week
    const actionBackStatus = state.backStatus
    const actionEnergy = state.energy

    setState((current) => {
      const existingLog = findLogByWorkoutKey(current.logs, actionWorkoutKey)
      const existingTodayLog = current.logs.find((log) => log.localDate === actionDate) ?? null
      if (existingTodayLog && existingTodayLog.workoutKey !== actionWorkoutKey) {
        return current
      }
      if (existingLog && existingLog.type !== 'core_only') {
        return current
      }

      const nextLog: LogEntry = {
        id: existingLog?.id ?? `${actionWorkoutKey}-${uid()}`,
        workoutKey: actionWorkoutKey,
        localDate: actionDate,
        week: actionWeek,
        type: 'core_only',
        plannedSession: actionRecommendation.plannedSession,
        completedSession: actionRecommendation.session,
        tier: actionRecommendation.tier,
        backStatus: actionBackStatus,
        energy: actionEnergy,
        exerciseSetCount: actionExerciseSetCount,
        checklistCompleted: actionCheckCount,
        rotationAdvanced: false,
        note: actionNote,
      }

      return {
        ...current,
        logs: upsertLogEntry(current.logs, nextLog),
        notes: '',
        coreDays: { ...current.coreDays, [actionDate]: true },
        dailyRoutineByDate: {
          ...current.dailyRoutineByDate,
          [actionDate]: {
            ...normalizeDailyRoutineTrack(current.dailyRoutineByDate[actionDate]),
            committed: true,
          },
        },
      }
    })
  }

  const advanceWeek = () => {
    setState((current) => ({
      ...current,
      week: current.week >= 4 ? 1 : current.week + 1,
      notes: '',
      coreDays: {},
    }))
  }

  const resetBlock = () => {
    if (!window.confirm('Reset the full block, including logs, today state, and session templates?')) {
      return
    }

    setState(defaultState)
    setActiveTab('today')
  }

  const resetSessionTemplatesToCoreFirst = () => {
    if (!window.confirm('Reset all session templates back to the core-first defaults?')) {
      return
    }

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
          <Card className="rounded-3xl shadow-sm">
            <CardHeader>
              <CardTitle>Supabase Setup Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-700">
              <p>This build requires Supabase for authentication and cloud persistence.</p>
              <p>
                Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart the dev server.
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
          <Card className="rounded-3xl shadow-sm">
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
      <div className="min-h-screen bg-[linear-gradient(180deg,#fefce8_0%,#f8fafc_42%,#f1f5f9_100%)] p-4 md:p-6">
        <div className="mx-auto max-w-md">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Sign In</CardTitle>
              <p className="text-sm text-slate-600">Use email + password or a magic link.</p>
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
          <Card className="rounded-3xl shadow-sm">
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
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_38%,#eef2ff_100%)] p-4 pb-28 md:p-6 md:pb-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden rounded-[28px] border-slate-200 shadow-sm">
            <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,#fef3c7,transparent_42%),radial-gradient(circle_at_top_right,#dbeafe,transparent_38%),linear-gradient(180deg,#ffffff,rgba(255,255,255,0.94))]">
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-2xl md:text-3xl">
                      <Dumbbell className="h-6 w-6" /> Life-Proof Strength
                    </CardTitle>
                    <p className="mt-2 text-sm text-slate-700">
                      Daily decision support for training around symptoms. Core Base first, lifting only when earned.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full bg-white/80 px-3 py-1 text-slate-900">
                      Week {state.week} / 4
                    </Badge>
                    <Badge variant="outline" className={`rounded-full px-3 py-1 ${todayStatus.className}`}>
                      {todayStatus.label}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/80 p-3 text-sm backdrop-blur">
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
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {authMessage}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/85 p-4 backdrop-blur">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Today&apos;s Check-In
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{todayStatus.detail}</p>
                      </div>
                      <Badge variant="outline" className={`rounded-full px-3 py-1 ${backStatusThemes[state.backStatus].badge}`}>
                        {backStatusThemes[state.backStatus].note}
                      </Badge>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Time available</Label>
                        <div className="flex flex-wrap gap-2">
                          {(['C', 'B', 'A'] as Tier[]).map((tier) => (
                            <Button
                              key={tier}
                              type="button"
                              variant={state.timeTier === tier ? 'default' : 'outline'}
                              className="rounded-xl"
                              onClick={() => selectTimeTier(tier)}
                            >
                              {tier}
                            </Button>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">{tierDescriptions[state.timeTier]}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>Back status</Label>
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['green', 'Green'],
                            ['yellow', 'Yellow'],
                            ['red', 'Red'],
                          ] as Array<[BackStatus, string]>).map(([key, label]) => (
                            <Button
                              key={key}
                              type="button"
                              variant={state.backStatus === key ? 'default' : 'outline'}
                              className="rounded-xl"
                              onClick={() => updateState({ backStatus: key })}
                            >
                              {label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Energy</Label>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Button
                              key={n}
                              type="button"
                              variant={state.energy === n ? 'default' : 'outline'}
                              className="h-10 w-10 rounded-full p-0"
                              onClick={() => updateState({ energy: n })}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`rounded-[22px] border p-4 ${backStatusThemes[recommendation.severity].panel}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                            Recommendation
                          </div>
                          <div className="mt-1 text-xl font-semibold text-slate-950">{activeSessionConfig.name}</div>
                          <p className="mt-1 text-sm text-slate-700">{activeSessionConfig.focus}</p>
                        </div>
                        <div className="space-y-2 text-right">
                          <Badge variant="outline" className="rounded-full px-3 py-1 bg-white/80">
                            Tier {recommendation.tier}
                          </Badge>
                          <div className="text-xs text-slate-600">
                            Planned S{recommendation.plannedSession}
                            {recommendation.session !== recommendation.plannedSession
                              ? ` -> Running S${recommendation.session}`
                              : ''}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-medium text-slate-800">{recommendation.note}</p>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-[24px] border border-white/70 bg-slate-950 p-4 text-white shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">This Week</div>
                        <p className="mt-1 text-sm text-slate-300">Wins count even if the day is core-only.</p>
                      </div>
                      <Button variant="secondary" size="sm" className="rounded-xl bg-white text-slate-950 hover:bg-slate-100" onClick={advanceWeek}>
                        Advance week
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>Weekly wins</span>
                        <span>{weekStats.wins}/4</span>
                      </div>
                      <Progress value={weekStats.progress} className="bg-slate-700" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/10 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Full sessions</div>
                        <div className="mt-1 text-2xl font-semibold">{weekStats.fullSessions}</div>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Core-only wins</div>
                        <div className="mt-1 text-2xl font-semibold">{weekStats.coreOnlyWins}</div>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Recovery subs</div>
                        <div className="mt-1 text-2xl font-semibold">{weekStats.recoverySubs}</div>
                      </div>
                      <div className="rounded-2xl bg-white/10 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Next rotation slot</div>
                        <div className="mt-1 text-2xl font-semibold">S{state.nextSession}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </div>
          </Card>
        </motion.div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 rounded-2xl bg-white/80 p-1 shadow-sm backdrop-blur">
            <TabsTrigger value="today" className="rounded-xl">
              Today
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-xl">
              History
            </TabsTrigger>
            <TabsTrigger value="templates" className="rounded-xl">
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="space-y-4">
            <Card className={`rounded-[28px] border-2 shadow-sm ${backStatusThemes[recommendation.severity].panel}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                  <Play className="h-5 w-5" /> Today&apos;s Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/70 bg-white/90 p-4">
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    Non-negotiable: morning reset daily + session Core Base first. Pain rule: stay at &lt;= 3/10 during and
                    the next day with no spreading symptoms.
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="font-medium">Tier guidance</div>
                          <Button variant="ghost" size="sm" className="rounded-xl" onClick={clearTodayChecks}>
                            Clear checks
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {tierRules.map((rule, idx) => (
                            <div key={idx} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                              <Checkbox checked={!!checklist[idx]} onCheckedChange={() => toggleChecklistItem(idx)} />
                              <div className="text-sm leading-5">{rule}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-2 text-sm font-medium">Exercise plan</div>
                        <div className="space-y-2">
                          {activeSessionConfig.exercises.map((exercise) => (
                            <div key={exercise.id} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="text-sm font-medium">{exercise.name}</div>
                              <div className="text-xs text-slate-600">
                                {exercise.load ? `Load target: ${exercise.load} · ` : ''}
                                {exercise.prescription || 'No prescription set'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center gap-2 font-medium">
                          <Timer className="h-4 w-4" /> Core Base
                        </div>
                        <div className="space-y-1 text-sm text-slate-700">
                          {coreBaseExercises.map((exercise) => (
                            <div key={exercise.id}>
                              - {exercise.name}: {exercise.prescription}
                            </div>
                          ))}
                        </div>
                        <Button
                          className="mt-3 rounded-xl"
                          variant={state.coreDays[today] ? 'default' : 'outline'}
                          onClick={toggleCoreDay}
                        >
                          {state.coreDays[today] ? 'Core Base checked off' : 'Mark Core Base done'}
                        </Button>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="font-medium">Daily routine</div>
                          <Button
                            size="sm"
                            variant={todayRoutine.committed ? 'default' : 'outline'}
                            className="rounded-xl"
                            onClick={toggleDailyCommit}
                          >
                            {todayRoutine.committed ? 'Committed today' : 'Commit today'}
                          </Button>
                        </div>
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
                          <Checkbox checked={todayRoutine.morningResetDone} onCheckedChange={toggleMorningReset} />
                          <span className="text-sm">Morning stiffness reset done (3-6 min)</span>
                        </label>
                        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                          <span>Movement snacks today</span>
                          <span>
                            {snacksDone}/{DAILY_SNACK_SLOTS}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {Array.from({ length: DAILY_SNACK_SLOTS }, (_, idx) => (
                            <label key={idx} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3">
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
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="rounded-[24px] border-slate-200 shadow-none">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">Set Log</CardTitle>
                      <p className="text-sm text-slate-600">Stable workout key: {workoutKey}</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {activeSessionConfig.exercises.map((exercise) => {
                        const rows = setLogs[exercise.id] || []
                        return (
                          <div key={exercise.id} className="space-y-3 rounded-2xl border border-slate-200 p-3">
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
                                {rows.map((row, index) => (
                                  <div key={index} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-slate-200 p-2">
                                    <div className="col-span-12 text-xs text-slate-500 sm:col-span-1">Set {index + 1}</div>
                                    <div className="col-span-4 sm:col-span-2">
                                      <Label className="text-xs">Reps</Label>
                                      <Input
                                        value={row.reps}
                                        onChange={(event) => updateSetRow(exercise.id, index, 'reps', event.target.value)}
                                        placeholder="5 or 30S"
                                      />
                                    </div>
                                    <div className="col-span-4 sm:col-span-3">
                                      <Label className="text-xs">Load</Label>
                                      <Input
                                        value={row.load}
                                        onChange={(event) => updateSetRow(exercise.id, index, 'load', event.target.value)}
                                        placeholder="+12.5kg or BW"
                                      />
                                    </div>
                                    <div className="col-span-4 sm:col-span-2">
                                      <Label className="text-xs">RPE</Label>
                                      <Input
                                        value={row.rpe}
                                        onChange={(event) => updateSetRow(exercise.id, index, 'rpe', event.target.value)}
                                        placeholder="6"
                                      />
                                    </div>
                                    <div className="col-span-8 flex items-center gap-2 pt-5 sm:col-span-2 sm:pt-0">
                                      <Checkbox
                                        checked={row.done}
                                        onCheckedChange={(checked) => updateSetRow(exercise.id, index, 'done', checked === true)}
                                      />
                                      <span className="text-sm">Done</span>
                                    </div>
                                    <div className="col-span-4 flex justify-end pt-5 sm:col-span-2 sm:pt-0">
                                      <Button size="icon" variant="ghost" onClick={() => removeSetRow(exercise.id, index)}>
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

                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        Set 1 pre-fills from the prescription. Extra sets copy your last values so quick logging stays fast on
                        mobile.
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className={`rounded-[24px] border shadow-none ${todayLog ? logTypeThemes[todayLog.type].panel : 'border-slate-200'}`}>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Today&apos;s status</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className={`rounded-full px-3 py-1 ${todayStatus.className}`}>
                            {todayStatus.label}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                            S{recommendation.plannedSession}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                            Tier {recommendation.tier}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-700">{todayStatus.detail}</p>
                        {todayLog ? (
                          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                            {describeHistoryLog(todayLog)}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>

                    <Card className="rounded-[24px] border-slate-200 shadow-none">
                      <CardHeader className="pb-4">
                        <CardTitle className="text-lg">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          id="notes"
                          value={state.notes}
                          onChange={(event) => updateState({ notes: event.target.value })}
                          placeholder="Pull-ups felt smooth. Back yellow but okay after warm-up."
                          className="min-h-[140px]"
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="sticky bottom-3 z-10">
              <div className="rounded-[24px] border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{todayStatus.label}</div>
                    <div className="text-sm text-slate-600">
                      {dayHasClosedWin
                        ? 'Today is already saved in history.'
                        : canUpgradeCoreOnly
                          ? 'You can upgrade today from core-only to a full session.'
                          : 'Save a full session or bank a core-only win.'}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={completeSession}
                      className="rounded-xl"
                      disabled={dayHasClosedWin}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      {canUpgradeCoreOnly ? 'Upgrade to full session' : 'Complete today'}
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      onClick={saveCoreOnlyWin}
                      disabled={dayHasClosedWin || canUpgradeCoreOnly || todayLog?.type === 'core_only'}
                    >
                      Save core-only win
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-xl text-slate-500" onClick={resetBlock}>
                      <RotateCcw className="mr-2 h-4 w-4" /> Reset block
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">This Week at a Glance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Wins</div>
                      <div className="mt-1 text-3xl font-semibold text-slate-950">{weekStats.wins}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Full sessions</div>
                      <div className="mt-1 text-3xl font-semibold text-slate-950">{weekStats.fullSessions}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Core-only</div>
                      <div className="mt-1 text-3xl font-semibold text-slate-950">{weekStats.coreOnlyWins}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Recovery subs</div>
                      <div className="mt-1 text-3xl font-semibold text-slate-950">{weekStats.recoverySubs}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>Win progress</span>
                      <span>{weekStats.progress}%</span>
                    </div>
                    <Progress value={weekStats.progress} />
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-medium text-slate-900">Routine summary (last 7 days)</div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>Committed days</span>
                          <span>{weeklySummary.committedDays}/7</span>
                        </div>
                        <Progress value={weeklySummary.commitProgress} />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>Morning resets</span>
                          <span>{weeklySummary.morningResetDays}/7</span>
                        </div>
                        <Progress value={weeklySummary.morningProgress} />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                          <span>Movement snacks</span>
                          <span>{weeklySummary.snackCount}/21</span>
                        </div>
                        <Progress value={weeklySummary.snackProgress} />
                      </div>
                      <div className="text-xs text-slate-500">Days with 3+ snacks: {weeklySummary.snackDaysAtLeastThree}/7</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">History</CardTitle>
                  <p className="text-sm text-slate-600">Recent wins, substitutions, and saved notes.</p>
                </CardHeader>
                <CardContent>
                  {state.logs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-600">
                      No history yet. Your first saved win will appear here.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {state.logs.slice(0, 18).map((log) => (
                        <div key={log.id} className={`rounded-[22px] border p-4 ${logTypeThemes[log.type].panel}`}>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                              {log.localDate}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                              W{log.week}
                            </Badge>
                            <Badge variant="outline" className={`rounded-full px-3 py-1 ${logTypeThemes[log.type].badge}`}>
                              {getLogTypeLabel(log.type)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                              Back: {log.backStatus}
                            </Badge>
                            <Badge variant="outline" className="rounded-full px-3 py-1 bg-white">
                              Energy: {log.energy}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-800">
                            <span className="font-medium">{describeHistoryLog(log)}</span>
                            <span className="text-slate-500">·</span>
                            <span>{log.exerciseSetCount} sets logged</span>
                            <span className="text-slate-500">·</span>
                            <span>{log.checklistCompleted} checks</span>
                          </div>
                          {log.note ? <div className="mt-2 text-sm text-slate-600">"{log.note}"</div> : null}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <Card className="rounded-[28px] border-slate-200 shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Save className="h-4 w-4" /> Session Templates
                  </CardTitle>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={resetSessionTemplatesToCoreFirst}>
                    Reset to defaults
                  </Button>
                </div>
                <p className="text-sm text-slate-600">Changes save automatically to Supabase.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4].map((sessionNum) => {
                  const sessionConfig = state.sessionConfigs[sessionNum]
                  return (
                    <div key={sessionNum} className="space-y-3 rounded-[24px] border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            S{sessionNum}: {sessionConfig.name}
                          </div>
                          <div className="text-xs text-slate-600">{sessionConfig.focus}</div>
                        </div>
                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                          {sessionConfig.exercises.length} exercises
                        </Badge>
                      </div>

                      <div className="space-y-3">
                        {sessionConfig.exercises.map((exercise) => (
                          <div key={exercise.id} className="grid grid-cols-1 items-start gap-2 rounded-2xl border border-slate-200 p-3 md:grid-cols-12">
                            <div className="md:col-span-4">
                              <Label className="text-xs">Exercise name</Label>
                              <Input
                                value={exercise.name}
                                onChange={(event) => updateExerciseField(sessionNum, exercise.id, 'name', event.target.value)}
                              />
                            </div>
                            <div className="md:col-span-3">
                              <Label className="text-xs">Default load</Label>
                              <Input
                                value={exercise.load}
                                onChange={(event) => updateExerciseField(sessionNum, exercise.id, 'load', event.target.value)}
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
                                placeholder="4 x 5 @ RPE 6"
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

                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => addExercise(sessionNum)}>
                        <Plus className="mr-1 h-4 w-4" /> Add exercise to S{sessionNum}
                      </Button>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
