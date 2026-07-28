/**
 * Application field definitions and types. Deliberately Zod-free.
 *
 * The form needs the option lists and the shape to render, but it does not need
 * the validation engine until someone actually presses submit. Keeping these in
 * a separate module means importing them does not drag Zod (~60 KB gzipped)
 * onto the landing page's critical path. See `application.ts` for the schema.
 */

export const NICHES = [
  'Beauty & skincare',
  'Health & wellness',
  'Fitness & recovery',
  'Home & kitchen',
  'Fashion & accessories',
  'Food & beverage',
  'Baby & kids',
  'Pets',
  'Tech & gadgets',
  'Other',
] as const;

export type Niche = (typeof NICHES)[number];

export const WORKED_WITH_WURX = [
  { value: 'no', label: 'No, this is my first time' },
  { value: 'yes', label: 'Yes, I know my contact by name' },
] as const;

export type WorkedWithWurx = (typeof WORKED_WITH_WURX)[number]['value'];

/** Raw form state. Empty strings are the "nothing picked yet" case. */
export interface ApplicationInput {
  tiktokHandle: string;
  email: string;
  niche: Niche | '';
  nicheOther?: string;
  workedWithWurx: WorkedWithWurx | '';
  videoLinks: string;
}

export const emptyApplication: ApplicationInput = {
  tiktokHandle: '',
  email: '',
  niche: '',
  nicheOther: '',
  workedWithWurx: '',
  videoLinks: '',
};

export type ApplicationErrors = Partial<Record<keyof ApplicationInput, string>>;
