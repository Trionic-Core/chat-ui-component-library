/**
 * Pure helpers behind the dictation language picker. Kept free of React and of
 * DOM globals so the search, defaulting and mode-learning rules are unit
 * testable in a node environment — the panel itself is the only untested part.
 *
 * The install's region decides how much of this matters. Regions WITH fast
 * transcription auto-detect across the configured candidate locales; regions
 * without it transcribe one locale at a time and silently use the first
 * configured one, which is how an English sentence comes back in Gujarati
 * script. Explicit selection is the only mechanism that reaches all 153
 * catalog locales on either kind of region.
 */

import type {
  DictationState,
  LanguageOption,
  VoiceLocale,
  VoiceStatus,
  VoiceTranscription,
} from '../types'

/**
 * Longest endonym still rendered in full on the trigger. Beyond this the
 * uppercased language subtag is shown instead ("Nederlands" -> "NL"), which
 * keeps the control the same width next to the mic whatever is selected.
 * Eight characters clears every Indic, CJK and Arabic endonym we ship.
 */
const MAX_COMPACT_LABEL_CHARS = 8

/**
 * Lowercase and strip combining marks so "português" matches "portugues".
 *
 * Applied to BOTH sides of every comparison, which is what makes it safe for
 * Indic scripts: folding also drops a Devanagari virama ("हिन्दी" -> "हिनदी"),
 * but the needle is mangled the same way as the haystack, so the match holds.
 */
export function foldForSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

const nativeNameCache = new Map<string, string | null>()

/**
 * The language's name in its own script, or `null` when this runtime cannot
 * produce one.
 *
 * `Intl.DisplayNames` carries the data the browser already ships, so 153
 * endonyms cost no bundle. Results are cached because each locale needs its own
 * formatter instance and building 153 of them on every mount is pure waste.
 */
export function nativeLanguageName(locale: string, languageCode: string): string | null {
  const key = `${locale}|${languageCode}`
  const cached = nativeNameCache.get(key)
  if (cached !== undefined) return cached

  let resolved: string | null = null
  if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
    try {
      const name = new Intl.DisplayNames([locale], { type: 'language' }).of(languageCode)
      // An unknown subtag is echoed back verbatim ("zzz" -> "zzz"); a
      // structurally invalid one throws. Neither is a name worth showing.
      if (name && name.toLowerCase() !== languageCode.toLowerCase()) resolved = name
    } catch {
      resolved = null
    }
  }

  nativeNameCache.set(key, resolved)
  return resolved
}

/**
 * Turn the install's catalog into renderable options.
 *
 * Defensive about its input on purpose: `VoiceLocale` types `language_code` and
 * `locale_name` as required, but the backend schema has them nullable, and one
 * bad row must not cost the user the other 152.
 */
export function buildLanguageOptions(locales: readonly VoiceLocale[] | undefined): LanguageOption[] {
  const options: LanguageOption[] = []
  const seen = new Set<string>()

  for (const entry of locales ?? []) {
    const locale = typeof entry?.locale === 'string' ? entry.locale.trim() : ''
    if (!locale) continue

    const key = locale.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    const declaredCode = typeof entry.language_code === 'string' ? entry.language_code.trim() : ''
    const languageCode = (declaredCode || locale.split('-', 1)[0]).toLowerCase()
    const declaredName = typeof entry.locale_name === 'string' ? entry.locale_name.trim() : ''
    const englishName = declaredName || locale
    const nativeName = nativeLanguageName(locale, languageCode) ?? englishName

    options.push({
      locale,
      languageCode,
      englishName,
      nativeName,
      search: {
        locale: foldForSearch(locale),
        code: foldForSearch(languageCode),
        english: foldForSearch(englishName),
        native: foldForSearch(nativeName),
      },
    })
  }

  return options
}

/** Find an option by locale, case-insensitively. */
export function findOption(
  options: readonly LanguageOption[],
  locale: string | null | undefined
): LanguageOption | undefined {
  if (!locale) return undefined
  const wanted = locale.trim().toLowerCase()
  if (!wanted) return undefined
  return options.find((option) => option.locale.toLowerCase() === wanted)
}

/**
 * Relevance of one option to an already-folded needle. Zero means no match.
 *
 * Ranking exists because plain substring matching buries the obvious answer:
 * "en" appears inside "Bengali" and "Slovenian", so English would sort below
 * both without it.
 */
export function scoreOption(option: LanguageOption, needle: string): number {
  const { locale, code, english, native } = option.search
  if (locale === needle || code === needle) return 4
  if (locale.startsWith(needle) || code.startsWith(needle)) return 3
  if (native.startsWith(needle) || english.startsWith(needle)) return 2
  if (native.includes(needle) || english.includes(needle) || locale.includes(needle)) return 1
  return 0
}

/**
 * Options matching `query`, best first. An empty query returns everything in
 * catalog order (the backend sorts by English name).
 *
 * Matches the endonym, the English name, the language subtag and the locale
 * code, so "guj", "ગુ", "gu-IN" and "Gujarati" all reach the same row.
 */
export function filterLanguages(
  options: readonly LanguageOption[],
  query: string
): LanguageOption[] {
  const needle = foldForSearch(query.trim())
  if (!needle) return [...options]

  return options
    .map((option, index) => ({ option, index, score: scoreOption(option, needle) }))
    .filter((entry) => entry.score > 0)
    // Catalog order breaks ties explicitly rather than leaning on sort stability.
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.option)
}

/** Whether the "Auto-detect" row survives the current query. */
export function matchesAutodetect(query: string): boolean {
  const needle = foldForSearch(query.trim())
  if (!needle) return true
  return 'auto-detect automatic detect'.includes(needle)
}

/**
 * The install's configured locales, in the order the FDE configured them.
 *
 * `autodetect_candidates` IS that configuration, so the "Frequent" section is
 * derived rather than a hardcoded guess at which languages matter.
 */
export function frequentOptions(
  options: readonly LanguageOption[],
  candidates: readonly string[] | undefined
): LanguageOption[] {
  const picked: LanguageOption[] = []
  const seen = new Set<string>()

  for (const candidate of candidates ?? []) {
    const option = findOption(options, candidate)
    if (!option || seen.has(option.locale)) continue
    seen.add(option.locale)
    picked.push(option)
  }

  return picked
}

/**
 * The locale to force when auto-detect is not on the table.
 *
 * The first configured candidate is what the backend would silently use anyway,
 * so defaulting to it makes the picker agree with reality before it is touched.
 */
export function defaultLanguage(
  candidates: readonly string[] | undefined,
  options: readonly LanguageOption[]
): string | null {
  for (const candidate of candidates ?? []) {
    const option = findOption(options, candidate)
    if (option) return option.locale
  }

  // A candidate outside the catalog is still what the backend would force, so
  // it beats picking an unrelated locale off the top of the list.
  const raw = (candidates ?? []).find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0
  )
  if (raw) return raw.trim()

  return options[0]?.locale ?? null
}

const RESTING_DICTATION: DictationState = {
  language: null,
  autodetectAvailable: true,
  explicit: false,
}

/**
 * Fold a (possibly late-arriving) `VoiceStatus` into the current selection.
 *
 * Returns the same object when nothing changed so the provider's state update
 * bails out instead of re-rendering the tree on every parent render.
 *
 * `autodetectAvailable: false` is sticky for the session. Once the install has
 * proved it cannot auto-detect — by config or by a `forced` response — a later
 * `null` from the status endpoint (which is per-process and resets on restart)
 * is not evidence to the contrary.
 */
export function syncWithStatus(
  state: DictationState,
  status: VoiceStatus | undefined,
  options: readonly LanguageOption[]
): DictationState {
  const autodetectAvailable = state.autodetectAvailable && status?.stt_autodetect_available !== false

  // An explicit choice survives, except for "Auto-detect" once auto-detect is
  // gone — that selection no longer means anything.
  const keepsChoice = state.explicit && (state.language !== null || autodetectAvailable)
  const language = keepsChoice
    ? state.language
    : autodetectAvailable
      ? null
      : defaultLanguage(status?.autodetect_candidates, options)

  if (language === state.language && autodetectAvailable === state.autodetectAvailable) {
    return state
  }
  return { language, autodetectAvailable, explicit: state.explicit }
}

/** Starting selection for an install, before anything has been transcribed. */
export function initialDictationState(
  status: VoiceStatus | undefined,
  options: readonly LanguageOption[]
): DictationState {
  return syncWithStatus(RESTING_DICTATION, status, options)
}

/** Record the user's pick. `null` means auto-detect. */
export function selectLanguage(state: DictationState, language: string | null): DictationState {
  if (state.language === language && state.explicit) return state
  return { ...state, language, explicit: true }
}

/**
 * Learn what the install can actually do from what it just did.
 *
 * Sending no language and getting `forced` back proves this region has no
 * auto-detect transport, whatever the status endpoint last claimed — so stop
 * offering the option and adopt the locale the backend actually used, which is
 * both honest about what happened and immediately correctable.
 *
 * Only the negative is learned: a `forced` reply to a language we named says
 * nothing, and an `autodetect` reply can only arrive when we already believed
 * auto-detect worked.
 */
export function learnFromTranscription(
  state: DictationState,
  sentLanguage: string | null,
  result: Pick<VoiceTranscription, 'mode' | 'language'> | undefined,
  options: readonly LanguageOption[],
  candidates: readonly string[] | undefined
): DictationState {
  if (sentLanguage !== null) return state
  if (result?.mode !== 'forced') return state
  if (!state.autodetectAvailable) return state

  const used = findOption(options, result.language)
  return {
    language: used?.locale ?? defaultLanguage(candidates, options),
    autodetectAvailable: false,
    explicit: state.explicit,
  }
}

/** Trigger label for a selection: the endonym when short, else `GU`-style code. */
export function compactLabel(option: LanguageOption): string {
  return option.nativeName.length <= MAX_COMPACT_LABEL_CHARS
    ? option.nativeName
    : option.languageCode.toUpperCase()
}

/**
 * The muted half of a row: enough English to identify the language, minus what
 * the endonym already said.
 *
 * The catalog ships ~16 Arabic locales and ~10 English ones, so the region is
 * the part that actually disambiguates — "English (India)" next to the endonym
 * "English" is noise, "India" is not.
 */
export function secondaryLabel(option: LanguageOption): string {
  const { englishName, nativeName } = option
  if (!englishName.startsWith(nativeName)) return englishName

  const remainder = englishName.slice(nativeName.length).trim()
  return remainder.replace(/^\(|\)$/g, '').trim()
}
