export const OFF_TYPES = { weekly_off: 'Weekly off', holiday: 'Holiday', leave: 'Personal leave', sick_leave: 'Sick leave', absence: 'Absent' };
export function monthlyAttendance(details, month, today) {
  const entries = Object.entries(details.daysOff || {}).filter(([date]) => date.slice(0,7) === month).sort(([a],[b]) => a.localeCompare(b));
  const taken = entries.filter(([date]) => date <= today);
  const planned = entries.filter(([date]) => date > today);
  const sum = rows => rows.reduce((total,[,v]) => total + Number(v.duration),0);
  return { entries, taken: sum(taken), planned: sum(planned), byType: Object.fromEntries(Object.keys(OFF_TYPES).map(type => [type, sum(taken.filter(([,v]) => v.type === type))])) };
}
