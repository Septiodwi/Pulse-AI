interface ScheduleInput { frequencyMinutes: number; activeDays: number[]; startTime: string; endTime: string; timezone: string }

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value.weekday ?? '')
  return { day, minutes: Number(value.hour) * 60 + Number(value.minute) }
}

function activeAt(date: Date, schedule: ScheduleInput) {
  const current = localParts(date, schedule.timezone)
  const start = Number(schedule.startTime.slice(0, 2)) * 60 + Number(schedule.startTime.slice(3))
  const end = Number(schedule.endTime.slice(0, 2)) * 60 + Number(schedule.endTime.slice(3))
  if (start <= end) return schedule.activeDays.includes(current.day) && current.minutes >= start && current.minutes <= end
  if (current.minutes >= start) return schedule.activeDays.includes(current.day)
  return current.minutes <= end && schedule.activeDays.includes((current.day + 6) % 7)
}

export function calculateNextRun(schedule: ScheduleInput, from = new Date()) {
  const step = schedule.frequencyMinutes * 60_000
  for (let candidate = new Date(from.getTime() + step), end = from.getTime() + 8 * 86_400_000; candidate.getTime() <= end; candidate = new Date(candidate.getTime() + step)) {
    if (activeAt(candidate, schedule)) return candidate.toISOString()
  }
  return null
}
