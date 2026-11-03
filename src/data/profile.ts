/**
 * Identity + the two facts on this site that change on their own: age and
 * the college year. Everything is computed in Indian Standard Time so the
 * numbers flip at midnight in Gujarat, not in the visitor's timezone.
 *
 * Only the computed age is ever rendered; the birth date itself is never
 * shown on the page.
 */

export const IDENTITY = {
  name: 'Kavya Gupta',
  first: 'KAVYA',
  last: 'GUPTA',
  role: 'Self-taught developer',
  location: 'Gujarat, India',
  timezone: 'Asia/Kolkata',
} as const;

const BIRTH = { year: 2009, month: 4, day: 3 } as const;

/** BCA at Shayona College (Gujarat University): a 3-year programme that began in the 2026–27 academic year. */
export const PROGRAMME = {
  degree: 'BCA',
  degreeLong: 'Bachelor of Computer Applications',
  college: 'Shayona College',
  university: 'Gujarat University',
  firstAcademicYear: 2026,
  years: 3,
  /**
   * The new academic year starts on 1 June (IST). Semester exams and results
   * land between March and May, so June is the first month that is
   * unambiguously "the next year" at Gujarat University colleges.
   */
  switchMonth: 6,
} as const;

interface ISTParts {
  year: number;
  month: number;
  day: number;
}

const istFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IDENTITY.timezone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function istParts(date: Date): ISTParts {
  const parts = istFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

export function ageOn(date: Date = new Date()): number {
  const { year, month, day } = istParts(date);
  let age = year - BIRTH.year;
  if (month < BIRTH.month || (month === BIRTH.month && day < BIRTH.day)) age -= 1;
  return age;
}

export type Education =
  | {
      status: 'studying';
      year: number;
      ordinal: string;
      label: string;
      short: string;
      academicYear: string;
    }
  | {
      status: 'graduated';
      classOf: number;
      label: string;
      short: string;
      yearsSince: number;
    };

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function educationOn(date: Date = new Date()): Education {
  const { year, month } = istParts(date);
  // Index of the academic year we are in, counted from the first one (0 = 2026–27).
  const index = Math.max(0, year - PROGRAMME.firstAcademicYear - (month >= PROGRAMME.switchMonth ? 0 : 1));
  if (index < PROGRAMME.years) {
    const start = PROGRAMME.firstAcademicYear + index;
    const ordinal = ORDINALS[index] ?? `${index + 1}th`;
    return {
      status: 'studying',
      year: index + 1,
      ordinal,
      label: `${PROGRAMME.degree} student · ${ordinal} year`,
      short: `${PROGRAMME.degree} · YR ${index + 1}`,
      academicYear: `${start}–${String((start + 1) % 100).padStart(2, '0')}`,
    };
  }
  const classOf = PROGRAMME.firstAcademicYear + PROGRAMME.years;
  return {
    status: 'graduated',
    classOf,
    label: `${PROGRAMME.degree} graduate · Class of ${classOf}`,
    short: `${PROGRAMME.degree} · GRAD ${classOf}`,
    yearsSince: Math.max(0, index - PROGRAMME.years),
  };
}

/** One sentence that is always true about what Kavya is right now. */
export function whatIAm(date: Date = new Date()): string {
  const edu = educationOn(date);
  return edu.status === 'studying'
    ? `${IDENTITY.role} & ${PROGRAMME.degree} student`
    : `${IDENTITY.role} & ${PROGRAMME.degree} graduate`;
}
