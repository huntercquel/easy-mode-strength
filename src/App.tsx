import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Dumbbell,
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

const STORAGE_KEY = 'life-proof-strength-block-v2'

type Tier = 'A' | 'B' | 'C'
type BackStatus = 'green' | 'yellow' | 'red'

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

interface AppState {
  week: number
  nextSession: number
  minutesAvailable: number
  backStatus: BackStatus
  energy: number
  notes: string
  logs: LogEntry[]
  coreDays: Record<string, boolean>
  sessionConfigs: Record<number, SessionConfig>
  setLogsByKey: Record<string, Record<string, SetRow[]>>
  checksByKey: Record<string, Record<number, boolean>>
}

interface Recommendation {
  tier: Tier
  session: number
  note: string
}

const weekRPECaps: Record<number, string> = {
  1: 'RPE 6 max',
  2: 'RPE 6–7 max',
  3: 'RPE 7 max',
  4: 'RPE 7–8 max (only if feeling good)',
}

const defaultSessionConfigs: Record<number, SessionConfig> = {
  1: {
    name: 'Session 1 — Pull + Core',
    focus: 'Pull strength priority',
    exercises: [
      { id: 's1e1', name: 'Weighted Pull-ups', load: '+10 kg', prescription: '4–5 x 3–5 @ RPE 6–7' },
      { id: 's1e2', name: 'Bodyweight Pull-up Back-off', load: 'BW', prescription: '2–3 x 5–8 clean' },
      { id: 's1e3', name: 'Row Variation', load: '', prescription: '2–3 x 8–12' },
      { id: 's1e4', name: 'Core (Side plank + Bird dog)', load: '', prescription: '1–2 rounds' },
    ],
    tierC: [
      '5 min warm-up: scap pulls, band rows, dead bug, easy pull-up sets',
      'Main lift only + core minimum',
      'Stop while reps are clean (no grinders)',
    ],
    tierB: [
      'Tier C plus back-off and row variation',
      'Keep total work crisp — leave reps in reserve',
    ],
    tierA: [
      'Tier B plus extra pull volume + longer core',
      'No ego reps — quality over fatigue',
    ],
  },
  2: {
    name: 'Session 2 — Lower + Push',
    focus: 'Weighted dips + back-friendly lower',
    exercises: [
      { id: 's2e1', name: 'Weighted Dips', load: '+15 kg', prescription: '4 x 3–5 @ RPE 6–7' },
      { id: 's2e2', name: 'Goblet / Split / Belt Squat', load: '', prescription: '2–3 x 6–10 @ RPE 6' },
      { id: 's2e3', name: 'Extra Lower Movement', load: '', prescription: '2–3 sets' },
      { id: 's2e4', name: 'Core (Bird dog / Dead bug)', load: '', prescription: '1–2 rounds' },
    ],
    tierC: [
      '5 min warm-up: glute bridge, BW squat, hinge drill, side plank',
      'Dips + one back-friendly lower movement + core',
      'If back is yellow, keep RPE 6 and supported options only',
    ],
    tierB: ['Tier C plus extra lower movement and dip back-off'],
    tierA: ['Tier B plus optional posterior chain accessory if back is green'],
  },
  3: {
    name: 'Session 3 — Muscle-Up Skill + Pull',
    focus: 'Skill quality + pull volume',
    exercises: [
      { id: 's3e1', name: 'Muscle-Up Technique', load: 'BW', prescription: '5–10 clean singles / drills' },
      { id: 's3e2', name: 'Bodyweight Pull-ups/Chin-ups', load: 'BW', prescription: '3 x 4–8 @ RPE 6–7' },
      {
        id: 's3e3',
        name: 'Weighted Pull-up (light/moderate)',
        load: '+5 kg',
        prescription: '3–4 x 3–4 @ RPE 6',
      },
      { id: 's3e4', name: 'Core (Side plank + Dead bug)', load: '', prescription: '1–2 rounds' },
    ],
    tierC: ['5 min warm-up + skill work + pull volume + core'],
    tierB: ['Tier C plus light/moderate weighted pull-up and row variation'],
    tierA: ['Tier B plus support holds and upper-back prehab'],
  },
  4: {
    name: 'Session 4 — Push + Lower + Core',
    focus: 'Push strength + lower exposure',
    exercises: [
      { id: 's4e1', name: 'Push Strength Variation', load: '', prescription: '4 x 4–6 @ RPE 6–7' },
      {
        id: 's4e2',
        name: 'Lower Exposure (split/goblet/step-up)',
        load: '',
        prescription: '2–3 x 6–10',
      },
      { id: 's4e3', name: 'Upper Accessory', load: '', prescription: '2–3 x 6–10' },
      { id: 's4e4', name: 'Core (Side plank/Pallof)', load: '', prescription: '2 rounds' },
    ],
    tierC: ['5 min warm-up + push + lower + core'],
    tierB: ['Tier C plus upper accessory + posterior chain accessory if tolerated'],
    tierA: ['Tier B plus extra push volume + longer trunk circuit'],
  },
}

const defaultState: AppState = {
  week: 1,
  nextSession: 1,
  minutesAvailable: 30,
  backStatus: 'green',
  energy: 3,
  notes: '',
  logs: [],
  coreDays: {},
  sessionConfigs: defaultSessionConfigs,
  setLogsByKey: {},
  checksByKey: {},
}

function getTierFromTime(minutes: number): Tier {
  if (minutes >= 75) return 'A'
  if (minutes >= 45) return 'B'
  return 'C'
}

function nextSessionNumber(current: number): number {
  return current === 4 ? 1 : current + 1
}

function getRecommendation({
  minutes,
  backStatus,
  nextSession,
  energy,
}: {
  minutes: number
  backStatus: BackStatus
  nextSession: number
  energy: number
}): Recommendation {
  const tier = getTierFromTime(minutes)
  let adjustedTier: Tier = tier
  let note = ''
  let sessionOverride: number | null = null

  if (backStatus === 'red') {
    adjustedTier = 'C'
    note = 'Red back day: Tier C + core minimum. Avoid heavy lower loading. Pain-free upper work only.'
    if ([2, 4].includes(nextSession)) {
      sessionOverride = 1
      note += ' Suggested swap to Session 1 today.'
    }
  } else if (backStatus === 'yellow') {
    if (tier === 'A') adjustedTier = 'B'
    note = 'Yellow back day: cap at RPE 6, choose supported lower options, reduce ROM/load, add core.'
  } else {
    note =
      energy <= 2
        ? 'Low energy day: Tier C still counts. Protect momentum.'
        : 'Green light — run the next session with your selected tier.'
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

export default function App() {
  const [state, setState] = useState<AppState>(defaultState)
  const [activeTab, setActiveTab] = useState('do')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppState>
        setState({
          ...defaultState,
          ...parsed,
          sessionConfigs: { ...defaultSessionConfigs, ...(parsed.sessionConfigs ?? {}) },
        })
      }
    } catch (error) {
      console.error(error)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const recommendation = useMemo(
    () =>
      getRecommendation({
        minutes: Number(state.minutesAvailable || 0),
        backStatus: state.backStatus,
        nextSession: state.nextSession,
        energy: state.energy,
      }),
    [state.minutesAvailable, state.backStatus, state.nextSession, state.energy],
  )

  const workoutKey = makeWorkoutKey(state, recommendation)
  const activeSessionConfig = state.sessionConfigs[recommendation.session]
  const checklist = state.checksByKey[workoutKey] || {}
  const setLogs = state.setLogsByKey[workoutKey] || {}

  const weekLogs = state.logs.filter((log) => log.week === state.week)
  const weekProgress = Math.min(100, (weekLogs.length / 4) * 100)
  const coreCount = Object.values(state.coreDays).filter(Boolean).length

  const tierKey: 'tierA' | 'tierB' | 'tierC' =
    recommendation.tier === 'A' ? 'tierA' : recommendation.tier === 'B' ? 'tierB' : 'tierC'
  const tierRules = activeSessionConfig[tierKey] || []

  const updateState = (patch: Partial<AppState>) => setState((current) => ({ ...current, ...patch }))

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

  const addSetRow = (exerciseId: string) => {
    setState((current) => ({
      ...current,
      setLogsByKey: {
        ...current.setLogsByKey,
        [workoutKey]: {
          ...(current.setLogsByKey[workoutKey] || {}),
          [exerciseId]: [...((current.setLogsByKey[workoutKey] || {})[exerciseId] || []), blankSetRow()],
        },
      },
    }))
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
    const logEntry: LogEntry = {
      date: todayDate(),
      week: state.week,
      session: recommendation.session,
      tier: recommendation.tier,
      backStatus: state.backStatus,
      energy: state.energy,
      minutesAvailable: Number(state.minutesAvailable || 0),
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
      coreDays: { ...current.coreDays, [todayDate()]: true },
    }))
  }

  const resetBlock = () => {
    setState(defaultState)
    setActiveTab('do')
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-xl md:text-2xl">
                <span className="flex items-center gap-2">
                  <Dumbbell className="h-5 w-5" /> Life-Proof Strength Block v2
                </span>
                <Badge variant="secondary">Week {state.week} / 4</Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">Never miss twice. Never require perfect conditions.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minutes">How much time do I have? (minutes)</Label>
                  <Input
                    id="minutes"
                    type="number"
                    min={10}
                    max={180}
                    value={state.minutesAvailable}
                    onChange={(event) => updateState({ minutesAvailable: Number(event.target.value || 0) })}
                  />
                  <p className="text-xs text-slate-500">25–35 = Tier C · 45–60 = Tier B · 75+ = Tier A</p>
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
                  <Label>Energy (1–5)</Label>
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
                    <div className="text-sm font-medium text-slate-900">This week RPE cap</div>
                    <div className="text-sm text-slate-600">{weekRPECaps[state.week]}</div>
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
                    <span>Core minimum days (target 4–6)</span>
                    <span>{coreCount}</span>
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
                  <Play className="h-5 w-5" /> Today’s Recommendation
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
                    <div className="text-sm text-slate-600">Based on {state.minutesAvailable} min</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-slate-500">Decision note</div>
                    <div className="text-sm font-medium text-slate-800">{recommendation.note}</div>
                  </div>
                </div>

                <div className="rounded-xl border bg-white p-3">
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

                  <div className="mb-2 text-sm font-medium">
                    Today’s exercise plan (from your editable session template)
                  </div>
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
                      <Timer className="h-4 w-4" /> Core Minimum (6–10 min)
                    </div>
                    <div className="space-y-1 text-sm text-slate-700">
                      <div>• Bird dog — 2 x 5/side (slow)</div>
                      <div>• Side plank — 2 x 20–30s/side</div>
                      <div>• Dead bug — 2 x 6/side</div>
                      <div>• Optional suitcase carry — 2 trips/side</div>
                    </div>
                    <Button
                      className="mt-3 rounded-xl"
                      variant={state.coreDays[todayDate()] ? 'default' : 'outline'}
                      onClick={markCoreDay}
                    >
                      {state.coreDays[todayDate()] ? 'Core day logged ✓' : 'Log core minimum'}
                    </Button>
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
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={completeSession} className="rounded-xl">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Complete session & advance rotation
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={markCoreDay}>
                    Log core only day
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
                            Target load: {exercise.load || '—'} · {exercise.prescription || '—'}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          onClick={() => addSetRow(exercise.id)}
                        >
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
                                />
                              </div>
                              <div className="col-span-4 sm:col-span-3">
                                <Label className="text-xs">Load</Label>
                                <Input
                                  value={row.load}
                                  onChange={(event) => updateSetRow(exercise.id, i, 'load', event.target.value)}
                                  placeholder="e.g. +12.5kg"
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
                                  onCheckedChange={(checked) => updateSetRow(exercise.id, i, 'done', checked)}
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
                  Tip: log exact reps/load/RPE here during the session, then hit <b>Complete session</b> on the Do
                  Workout tab when finished.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit" className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Save className="h-4 w-4" /> Edit session templates (exercise names + loads)
                </CardTitle>
                <p className="text-sm text-slate-600">Changes save automatically to your browser.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {[1, 2, 3, 4].map((sessionNum) => {
                  const session = state.sessionConfigs[sessionNum]
                  return (
                    <div key={sessionNum} className="space-y-3 rounded-xl border p-3">
                      <div className="font-medium">
                        S{sessionNum}: {session.name}
                      </div>
                      <div className="text-xs text-slate-600">{session.focus}</div>

                      <div className="space-y-3">
                        {session.exercises.map((exercise) => (
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
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeExercise(sessionNum, exercise.id)}
                              >
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
                        {log.mainLiftDone ? '✅ Session done' : '• Partial'} · {log.minutesAvailable} min ·{' '}
                        {log.checklistCompleted} checks · {log.exerciseSetCount || 0} sets logged
                      </div>
                      {log.note ? <div className="mt-1 text-slate-600">“{log.note}”</div> : null}
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
