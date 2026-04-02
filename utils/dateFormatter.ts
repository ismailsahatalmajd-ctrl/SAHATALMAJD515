import { format } from 'date-fns';

const arabicDays = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const englishDays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export function formatDateWithDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const formatted = format(d, 'yyyy-MM-dd');
  const dayIndex = d.getDay(); // 0 = Sunday
  const arabic = arabicDays[dayIndex];
  const english = englishDays[dayIndex];
  return `${formatted} (${arabic}) (${english})`;
}
