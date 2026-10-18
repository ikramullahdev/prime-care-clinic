const CLINIC_TIME_ZONE = 'Asia/Karachi';
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function toDateColumn(value) {
  return new Date(`${value}T00:00:00.000Z`);
}

function clinicToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function clinicMinutesNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour').value);
  const minute = Number(parts.find((part) => part.type === 'minute').value);
  return hour * 60 + minute;
}

function validateBookableDate(value, now = new Date()) {
  const date = normalizeDate(value);
  if (!date) return { error: 'Appointment date must be a valid calendar date (YYYY-MM-DD).' };

  const today = clinicToday(now);
  const selected = toDateColumn(date);
  const firstBookable = toDateColumn(today);
  const lastBookable = new Date(firstBookable);
  lastBookable.setUTCDate(lastBookable.getUTCDate() + 60);

  if (selected < firstBookable) return { error: 'Appointment date cannot be in the past.' };
  if (selected > lastBookable) return { error: 'Appointments can only be scheduled up to 60 days in advance.' };
  return { date };
}

function parseSlotStart(value) {
  if (typeof value !== 'string') return null;
  const canonical = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (canonical) return value;

  const legacyRange = value.match(/^(1[0-2]|[1-9]):([0-5]\d)\s*(AM|PM)\s*-\s*(1[0-2]|[1-9]):([0-5]\d)\s*(AM|PM)$/i);
  if (!legacyRange) return null;
  const startHour = (Number(legacyRange[1]) % 12) + (legacyRange[3].toUpperCase() === 'PM' ? 12 : 0);
  const endHour = (Number(legacyRange[4]) % 12) + (legacyRange[6].toUpperCase() === 'PM' ? 12 : 0);
  const startMinute = startHour * 60 + Number(legacyRange[2]);
  const endMinute = endHour * 60 + Number(legacyRange[5]);
  if (endMinute <= startMinute) return null;
  return `${String(startHour).padStart(2, '0')}:${legacyRange[2]}`;
}

function minutesFromTime(value) {
  const time = parseSlotStart(value);
  if (!time) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function timeFromMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function formatTimeLabel(minutes) {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatSlotRange(startMinutes, duration) {
  return `${formatTimeLabel(startMinutes)} - ${formatTimeLabel(startMinutes + duration)}`;
}

function scheduledWeekdays(scheduleDays) {
  if (typeof scheduleDays !== 'string' || !scheduleDays.trim()) {
    throw new Error('Doctor schedule days are not configured.');
  }
  const names = new Map(DAY_NAMES.map((day) => [day.toLowerCase(), day]));
  const fullDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  fullDays.forEach((day, index) => names.set(day.toLowerCase(), DAY_NAMES[index]));
  const days = scheduleDays.split(',').map((day) => names.get(day.trim().toLowerCase()));
  if (days.some((day) => !day)) throw new Error('Doctor schedule contains an invalid weekday.');
  return new Set(days);
}

function getDoctorSlots(doctor, date, now = new Date()) {
  const dateString = normalizeDate(date);
  const start = minutesFromTime(doctor.startTime);
  const end = minutesFromTime(doctor.endTime);
  const duration = doctor.slotDurationMinutes;
  if (!dateString || start === null || end === null || start >= end ||
      !Number.isInteger(duration) || duration < 1 || duration > 1440) {
    throw new Error('Doctor schedule is incomplete or invalid.');
  }

  const weekdays = scheduledWeekdays(doctor.scheduleDays);
  const weekday = DAY_NAMES[toDateColumn(dateString).getUTCDay()];
  if (!weekdays.has(weekday)) return [];
  const firstAvailableMinute = dateString === clinicToday(now) ? clinicMinutesNow(now) + 1 : 0;

  const slots = [];
  for (let minute = start; minute + duration <= end; minute += duration) {
    if (minute < firstAvailableMinute) continue;
    const slotStart = timeFromMinutes(minute);
    slots.push({
      slotStart,
      label: formatSlotRange(minute, duration),
    });
  }
  return slots;
}

function slotRequestError(date, slotStart, doctor, now = new Date()) {
  const dateResult = validateBookableDate(date, now);
  if (dateResult.error) return dateResult.error;
  const canonicalStart = parseSlotStart(slotStart);
  if (!canonicalStart) return 'Choose a valid appointment time slot.';
  if (!getDoctorSlots(doctor, dateResult.date, now).some((slot) => slot.slotStart === canonicalStart)) {
    return 'The selected time is outside this doctor’s schedule. Please choose an available slot.';
  }
  return null;
}

module.exports = {
  clinicToday,
  clinicMinutesNow,
  formatSlotRange,
  getDoctorSlots,
  normalizeDate,
  parseSlotStart,
  slotRequestError,
  toDateColumn,
  validateBookableDate,
};
