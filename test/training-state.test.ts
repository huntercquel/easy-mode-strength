import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatDateKey,
  getRecommendation,
  getWeekStats,
  makeWorkoutKey,
  normalizeLoadedState,
  upsertLogEntry,
} from '../src/lib/training-state.ts'

test('formatDateKey respects explicit time zones', () => {
  const moment = new Date('2026-03-06T00:30:00Z')

  assert.equal(formatDateKey(moment, 'UTC'), '2026-03-06')
  assert.equal(formatDateKey(moment, 'America/Los_Angeles'), '2026-03-05')
})

test('red lower-day recommendation becomes a recovery substitute without rotation advance', () => {
  const recommendation = getRecommendation({
    selectedTier: 'A',
    backStatus: 'red',
    nextSession: 3,
    energy: 4,
  })

  assert.equal(recommendation.tier, 'C')
  assert.equal(recommendation.plannedSession, 3)
  assert.equal(recommendation.session, 1)
  assert.equal(recommendation.completionType, 'recovery_substitute')
  assert.equal(recommendation.rotationAdvancedOnComplete, false)
})

test('normalizeLoadedState backfills legacy log entries into the new shape', () => {
  const state = normalizeLoadedState({
    logs: [
      {
        date: '2026-03-04',
        week: 2,
        session: 4,
        tier: 'B',
        backStatus: 'yellow',
        energy: 3,
        checklistCompleted: 2,
        exerciseSetCount: 6,
        note: 'Legacy entry',
        workoutKey: 'legacy-key',
      },
    ],
  })

  assert.equal(state.logs.length, 1)
  assert.deepEqual(state.logs[0], {
    id: 'legacy-key-0',
    workoutKey: 'legacy-key',
    localDate: '2026-03-04',
    week: 2,
    type: 'full',
    plannedSession: 4,
    completedSession: 4,
    tier: 'B',
    backStatus: 'yellow',
    energy: 3,
    exerciseSetCount: 6,
    checklistCompleted: 2,
    rotationAdvanced: true,
    note: 'Legacy entry',
  })
})

test('upsertLogEntry keeps a single log per workout key and week stats count wins by type', () => {
  const workoutKey = makeWorkoutKey('2026-03-06', 1, 2)

  const first = {
    id: 'log-1',
    workoutKey,
    localDate: '2026-03-06',
    week: 1,
    type: 'core_only' as const,
    plannedSession: 2,
    completedSession: 2,
    tier: 'C' as const,
    backStatus: 'yellow' as const,
    energy: 2,
    exerciseSetCount: 0,
    checklistCompleted: 1,
    rotationAdvanced: false,
    note: '',
  }

  const upgraded = {
    ...first,
    type: 'full' as const,
    tier: 'B' as const,
    exerciseSetCount: 8,
    rotationAdvanced: true,
  }

  const logs = upsertLogEntry(
    upsertLogEntry([], first),
    {
      ...upgraded,
      id: 'log-1',
    },
  )

  assert.equal(logs.length, 1)
  assert.equal(logs[0]?.type, 'full')

  const stats = getWeekStats(
    [
      ...logs,
      {
        id: 'log-2',
        workoutKey: makeWorkoutKey('2026-03-07', 1, 3),
        localDate: '2026-03-07',
        week: 1,
        type: 'recovery_substitute',
        plannedSession: 3,
        completedSession: 1,
        tier: 'C',
        backStatus: 'red',
        energy: 2,
        exerciseSetCount: 3,
        checklistCompleted: 1,
        rotationAdvanced: false,
        note: '',
      },
      {
        id: 'log-3',
        workoutKey: makeWorkoutKey('2026-03-08', 1, 4),
        localDate: '2026-03-08',
        week: 1,
        type: 'core_only',
        plannedSession: 4,
        completedSession: 4,
        tier: 'C',
        backStatus: 'green',
        energy: 3,
        exerciseSetCount: 0,
        checklistCompleted: 0,
        rotationAdvanced: false,
        note: '',
      },
    ],
    1,
  )

  assert.deepEqual(stats, {
    wins: 3,
    fullSessions: 1,
    coreOnlyWins: 1,
    recoverySubs: 1,
    progress: 75,
  })
})
