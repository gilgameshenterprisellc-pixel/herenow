import Constants from 'expo-constants'
import { supabase } from './supabase'

// ── Question model ────────────────────────────────────────────────────────────
// Questions live here so they can be edited/reordered without a DB migration —
// answers are stored as a JSONB blob keyed by question id (see survey_submissions.sql).

export type SurveyQuestionType = 'stars' | 'scale' | 'single' | 'text'

export interface SurveyQuestion {
  id:        string
  type:      SurveyQuestionType
  prompt:    string
  options?:  string[]   // for 'single'
  optional?: boolean    // if false/undefined it's encouraged; see REQUIRED_IDS
  minLabel?: string     // for 'scale'
  maxLabel?: string     // for 'scale'
}

// Jacob's beta questions (July 2026). Edit freely — the store is question-agnostic.
export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  { id: 'q1',  type: 'stars', prompt: 'Overall, how would you rate your experience using HereNow?' },
  { id: 'q2',  type: 'scale', prompt: 'If HereNow launched tomorrow, how likely would you be to use it?', minLabel: 'Not likely', maxLabel: 'Very likely' },
  { id: 'q3',  type: 'single', prompt: "How often do you think you'd realistically use HereNow?",
    options: ['Every time I go out', 'About once a week', 'A few times a month', 'Occasionally', "Probably wouldn't use it"] },
  { id: 'q4',  type: 'text', prompt: 'Was anything confusing or difficult to understand?' },
  { id: 'q5',  type: 'text', prompt: 'At any point did you get stuck or not know what to do next? If so, what happened?' },
  { id: 'q6',  type: 'single', prompt: 'Which feature did you enjoy the most?',
    options: ['Presence Map', 'Check In', 'Pulse', 'Venue Chat', 'We Met', 'My Circle', 'Seeing who was there', 'Other'] },
  { id: 'q7',  type: 'single', prompt: 'Which feature felt the least useful?',
    options: ['Presence Map', 'Check In', 'Pulse', 'Venue Chat', 'We Met', 'My Circle', 'Other'] },
  { id: 'q8',  type: 'text', prompt: 'What would make you use HereNow every time you go out?' },
  { id: 'q9',  type: 'text', prompt: 'What is one feature you wish HereNow had?' },
  { id: 'q10', type: 'single', prompt: 'Would you feel comfortable checking in publicly?',
    options: ['Yes', 'Maybe', 'Probably not'] },
  { id: 'q11', type: 'single', prompt: "Would you use 'We Met' after meeting someone new?",
    options: ['Definitely', 'Probably', 'Maybe', 'Probably not', 'Never'] },
  { id: 'q12', type: 'single', prompt: 'Did HereNow make your night better?',
    options: ['Yes', 'A little', 'No difference', 'It made it worse'] },
  { id: 'q13', type: 'text', prompt: 'Think creatively for a second. Outside of tonight, what types of places, events, or experiences could you see yourself using HereNow?' },
  { id: 'q14', type: 'text', prompt: 'In one sentence, how would you explain HereNow to a friend?' },
  { id: 'q15', type: 'text', prompt: "Six months from now, what's one feature or capability you'd hope HereNow has that it doesn't today?" },
  { id: 'q16', type: 'text', prompt: 'If you could change ONE thing before launch, what would it be?' },
  { id: 'q17', type: 'text', prompt: 'What did you love most about HereNow?' },
  { id: 'q18', type: 'single', prompt: 'Age (optional)', optional: true,
    options: ['18–24', '25–34', '35–44', '45+'] },
  { id: 'q19', type: 'single', prompt: 'How often do you typically go out? (optional)', optional: true,
    options: ['Multiple times a week', 'About once a week', 'A few times a month', 'Rarely'] },
  { id: 'q20', type: 'text', prompt: "Is there anything else you'd like to tell us? (optional)", optional: true },
]

// The two one-tap quantitative anchors gate submission so every response carries
// a rating + likelihood score. Everything else is encouraged but never blocks.
export const REQUIRED_IDS = ['q1', 'q2'] as const

export type SurveyAnswers = Record<string, string | number>

export function questionById(id: string): SurveyQuestion | undefined {
  return SURVEY_QUESTIONS.find((q) => q.id === id)
}

export async function submitSurvey(answers: SurveyAnswers): Promise<{ ok: boolean; error?: string }> {
  const appVersion = Constants.expoConfig?.version ?? null
  const { error } = await supabase
    .from('survey_submissions')
    .insert({ answers, app_version: appVersion })
  if (error) {
    console.error('[survey] submit error:', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export interface SurveySubmission {
  id:           string
  answers:      SurveyAnswers
  app_version:  string | null
  submitted_at: string
}

export async function fetchSurveySubmissions(): Promise<SurveySubmission[]> {
  const { data, error } = await supabase
    .from('survey_submissions')
    .select('id, answers, app_version, submitted_at')
    .order('submitted_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('[survey] fetch error:', error.message)
    return []
  }
  return (data ?? []) as SurveySubmission[]
}
