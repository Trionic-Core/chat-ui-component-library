import { describe, expect, it } from 'vitest'
import {
  buildLanguageOptions,
  compactLabel,
  defaultLanguage,
  filterLanguages,
  findOption,
  foldForSearch,
  frequentOptions,
  initialDictationState,
  learnFromTranscription,
  matchesAutodetect,
  nativeLanguageName,
  secondaryLabel,
  selectLanguage,
  syncWithStatus,
} from './language'
import type { DictationState, VoiceLocale, VoiceStatus } from '../types'

/* ------------------------------------------------------------------
 * Guards for the rules behind the dictation picker.
 *
 * The stakes are concrete: on a region without fast transcription the
 * backend forces the FIRST configured locale when the client names
 * none, which is how an English sentence comes back in Gujarati
 * script. So the defaulting rules, the mode-learning reducer, and the
 * search that has to surface a language out of 153 are all load-
 * bearing — a wrong default here is a wrong transcript for the user.
 * ----------------------------------------------------------------*/

const CATALOG: VoiceLocale[] = [
  { locale: 'bn-IN', locale_name: 'Bengali (India)', language_code: 'bn', default_voice: 'bn-IN-A' },
  { locale: 'en-IN', locale_name: 'English (India)', language_code: 'en', default_voice: 'en-IN-A' },
  { locale: 'en-US', locale_name: 'English (United States)', language_code: 'en', default_voice: 'en-US-A' },
  { locale: 'gu-IN', locale_name: 'Gujarati (India)', language_code: 'gu', default_voice: 'gu-IN-A' },
  { locale: 'hi-IN', locale_name: 'Hindi (India)', language_code: 'hi', default_voice: 'hi-IN-A' },
  { locale: 'nl-NL', locale_name: 'Dutch (Netherlands)', language_code: 'nl', default_voice: 'nl-NL-A' },
  { locale: 'ta-IN', locale_name: 'Tamil (India)', language_code: 'ta', default_voice: 'ta-IN-A' },
]

const OPTIONS = buildLanguageOptions(CATALOG)

function localesOf(options: ReadonlyArray<{ locale: string }>): string[] {
  return options.map((option) => option.locale)
}

describe('buildLanguageOptions', () => {
  it('renders endonyms from Intl rather than shipping a name table', () => {
    expect(findOption(OPTIONS, 'gu-IN')?.nativeName).toBe('ગુજરાતી')
    expect(findOption(OPTIONS, 'ta-IN')?.nativeName).toBe('தமிழ்')
  })

  it('falls back to the catalog name when Intl has no endonym for the code', () => {
    const options = buildLanguageOptions([
      { locale: 'zz-ZZ', locale_name: 'Testish (Nowhere)', language_code: 'zzz', default_voice: 'v' },
    ])
    expect(options[0].nativeName).toBe('Testish (Nowhere)')
  })

  it('survives a structurally invalid subtag instead of throwing', () => {
    // Intl.DisplayNames.of() throws RangeError on a malformed tag, and one bad
    // catalog row must not cost the user the other 152.
    const options = buildLanguageOptions([
      { locale: 'x!-!!', locale_name: 'Broken', language_code: '!!', default_voice: 'v' },
    ])
    expect(options).toHaveLength(1)
    expect(options[0].nativeName).toBe('Broken')
  })

  it('derives the language code from the locale when the backend omits it', () => {
    // VoiceLocale types language_code as required; the backend schema has it
    // nullable, so the runtime value can be missing.
    const options = buildLanguageOptions([
      { locale: 'gu-IN', locale_name: 'Gujarati (India)', default_voice: 'v' } as VoiceLocale,
    ])
    expect(options[0].languageCode).toBe('gu')
    expect(options[0].nativeName).toBe('ગુજરાતી')
  })

  it('skips rows with no usable locale and de-duplicates the rest', () => {
    const options = buildLanguageOptions([
      { locale: '  ', locale_name: 'Blank', language_code: 'x', default_voice: 'v' },
      { locale: 'gu-IN', locale_name: 'Gujarati (India)', language_code: 'gu', default_voice: 'v' },
      { locale: 'GU-in', locale_name: 'Gujarati again', language_code: 'gu', default_voice: 'v' },
    ])
    expect(localesOf(options)).toEqual(['gu-IN'])
  })

  it('accepts undefined locales, which is what an unconfigured install reports', () => {
    expect(buildLanguageOptions(undefined)).toEqual([])
  })
})

describe('foldForSearch', () => {
  it('folds Latin diacritics so portugues finds português', () => {
    expect(foldForSearch('Português')).toBe('portugues')
  })

  it('mangles Indic marks identically on both sides, so matching still holds', () => {
    // Folding drops the Devanagari virama. That is fine precisely because the
    // needle goes through the same transform as the haystack.
    expect(foldForSearch('हिन्दी')).toBe(foldForSearch('हिन्दी'))
    expect(foldForSearch('ગુજરાતી').includes(foldForSearch('ગુ'))).toBe(true)
  })
})

describe('filterLanguages', () => {
  it('finds Gujarati by every handle a user might reach for', () => {
    for (const query of ['guj', 'ગુ', 'gu-IN', 'Gujarati', 'GU']) {
      expect(localesOf(filterLanguages(OPTIONS, query))).toContain('gu-IN')
    }
  })

  it('ranks the language above the ones that merely contain the letters', () => {
    // "en" is a substring of Bengali and Slovenian; English must still win.
    const results = localesOf(filterLanguages(OPTIONS, 'en'))
    expect(results.slice(0, 2).sort()).toEqual(['en-IN', 'en-US'])
    expect(results).toContain('bn-IN')
    expect(results.indexOf('bn-IN')).toBeGreaterThan(results.indexOf('en-US'))
  })

  it('puts an exact locale match first', () => {
    expect(filterLanguages(OPTIONS, 'en-US')[0].locale).toBe('en-US')
  })

  it('keeps catalog order within a relevance tier', () => {
    expect(localesOf(filterLanguages(OPTIONS, 'india')).slice(0, 2)).toEqual(['bn-IN', 'en-IN'])
  })

  it('returns everything for an empty or whitespace query', () => {
    expect(filterLanguages(OPTIONS, '')).toHaveLength(OPTIONS.length)
    expect(filterLanguages(OPTIONS, '   ')).toHaveLength(OPTIONS.length)
  })

  it('returns nothing when the query matches nothing, so the panel can say so', () => {
    expect(filterLanguages(OPTIONS, 'klingon')).toEqual([])
  })

  it('does not hand back its input array', () => {
    expect(filterLanguages(OPTIONS, '')).not.toBe(OPTIONS)
  })
})

describe('matchesAutodetect', () => {
  it('keeps the row visible until the query rules it out', () => {
    expect(matchesAutodetect('')).toBe(true)
    expect(matchesAutodetect('auto')).toBe(true)
    expect(matchesAutodetect('detect')).toBe(true)
    expect(matchesAutodetect('gujarati')).toBe(false)
  })
})

describe('frequentOptions', () => {
  it('follows the order the install configured, not catalog order', () => {
    expect(localesOf(frequentOptions(OPTIONS, ['hi-IN', 'en-IN']))).toEqual(['hi-IN', 'en-IN'])
  })

  it('drops candidates the catalog does not carry and de-duplicates', () => {
    expect(localesOf(frequentOptions(OPTIONS, ['xx-XX', 'gu-IN', 'GU-IN']))).toEqual(['gu-IN'])
  })

  it('is empty when the install configured nothing', () => {
    expect(frequentOptions(OPTIONS, undefined)).toEqual([])
  })
})

describe('defaultLanguage', () => {
  it('picks the first configured candidate — the one the backend would force', () => {
    expect(defaultLanguage(['hi-IN', 'en-IN'], OPTIONS)).toBe('hi-IN')
  })

  it('normalizes to the catalog spelling', () => {
    expect(defaultLanguage(['HI-in'], OPTIONS)).toBe('hi-IN')
  })

  it('prefers a catalog-known candidate over an unknown one earlier in the list', () => {
    expect(defaultLanguage(['xx-XX', 'gu-IN'], OPTIONS)).toBe('gu-IN')
  })

  it('still forwards an unknown candidate rather than picking an unrelated locale', () => {
    // The backend would force it regardless; guessing something else would be
    // a different wrong answer.
    expect(defaultLanguage(['xx-XX'], OPTIONS)).toBe('xx-XX')
  })

  it('falls back to the first catalog locale when nothing is configured', () => {
    expect(defaultLanguage(undefined, OPTIONS)).toBe('bn-IN')
    expect(defaultLanguage([], OPTIONS)).toBe('bn-IN')
  })

  it('returns null when there is nothing to choose from at all', () => {
    expect(defaultLanguage(undefined, [])).toBeNull()
  })
})

describe('initialDictationState', () => {
  const enabled = (over: Partial<VoiceStatus> = {}): VoiceStatus => ({
    enabled: true,
    locales: CATALOG,
    autodetect_candidates: ['hi-IN', 'en-IN'],
    ...over,
  })

  it('starts on auto-detect when the region supports it', () => {
    const state = initialDictationState(enabled({ stt_autodetect_available: true }), OPTIONS)
    expect(state).toEqual({ language: null, autodetectAvailable: true, explicit: false })
  })

  it('treats unknown support as available — the response will settle it', () => {
    expect(initialDictationState(enabled({ stt_autodetect_available: null }), OPTIONS).language).toBeNull()
    expect(initialDictationState(enabled(), OPTIONS).autodetectAvailable).toBe(true)
  })

  it('pre-selects the forced locale when the region cannot auto-detect', () => {
    const state = initialDictationState(enabled({ stt_autodetect_available: false }), OPTIONS)
    expect(state).toEqual({ language: 'hi-IN', autodetectAvailable: false, explicit: false })
  })

  it('is inert before the consumer has fetched the status', () => {
    expect(initialDictationState(undefined, [])).toEqual({
      language: null,
      autodetectAvailable: true,
      explicit: false,
    })
  })
})

describe('syncWithStatus', () => {
  const resting: DictationState = { language: null, autodetectAvailable: true, explicit: false }
  const singleLanguage: VoiceStatus = {
    enabled: true,
    locales: CATALOG,
    autodetect_candidates: ['hi-IN', 'en-IN'],
    stt_autodetect_available: false,
  }

  it('adopts a status that arrives after mount', () => {
    // The consumer fetches GET /v1/enterprise/voice, so the first render always
    // sees undefined.
    expect(syncWithStatus(resting, singleLanguage, OPTIONS)).toEqual({
      language: 'hi-IN',
      autodetectAvailable: false,
      explicit: false,
    })
  })

  it('returns the same object when nothing changed, so the provider does not re-render', () => {
    const state = syncWithStatus(resting, singleLanguage, OPTIONS)
    expect(syncWithStatus(state, singleLanguage, OPTIONS)).toBe(state)
    expect(syncWithStatus(resting, undefined, [])).toBe(resting)
  })

  it('keeps an explicit choice when the status re-arrives', () => {
    const chosen = selectLanguage(resting, 'ta-IN')
    expect(syncWithStatus(chosen, singleLanguage, OPTIONS).language).toBe('ta-IN')
  })

  it('replaces an explicit auto-detect once auto-detect stops being possible', () => {
    const chosen = selectLanguage(resting, null)
    expect(syncWithStatus(chosen, singleLanguage, OPTIONS)).toEqual({
      language: 'hi-IN',
      autodetectAvailable: false,
      explicit: true,
    })
  })

  it('never re-enables auto-detect that was already ruled out', () => {
    // The backend's flag is per-process and resets on restart, so a later null
    // is not evidence that the region gained a transport.
    const learned = { language: 'hi-IN', autodetectAvailable: false, explicit: false }
    const optimistic: VoiceStatus = { ...singleLanguage, stt_autodetect_available: null }
    expect(syncWithStatus(learned, optimistic, OPTIONS).autodetectAvailable).toBe(false)
  })
})

describe('selectLanguage', () => {
  const resting: DictationState = { language: null, autodetectAvailable: true, explicit: false }

  it('records the pick and marks it explicit', () => {
    expect(selectLanguage(resting, 'gu-IN')).toEqual({
      language: 'gu-IN',
      autodetectAvailable: true,
      explicit: true,
    })
  })

  it('marks a defaulted value explicit when the user picks the same thing', () => {
    // Confirming the default is still a choice — it must survive a later status.
    const defaulted: DictationState = { language: 'hi-IN', autodetectAvailable: false, explicit: false }
    expect(selectLanguage(defaulted, 'hi-IN').explicit).toBe(true)
  })

  it('is a no-op once the same choice is already explicit', () => {
    const chosen = selectLanguage(resting, 'gu-IN')
    expect(selectLanguage(chosen, 'gu-IN')).toBe(chosen)
  })
})

describe('learnFromTranscription', () => {
  const resting: DictationState = { language: null, autodetectAvailable: true, explicit: false }
  const candidates = ['hi-IN', 'en-IN']

  it('stops offering auto-detect when a language-less request comes back forced', () => {
    // This is the whole point: the region has no auto-detect transport, whatever
    // the status endpoint last claimed.
    const next = learnFromTranscription(
      resting,
      null,
      { mode: 'forced', language: 'hi-IN' },
      OPTIONS,
      candidates
    )
    expect(next).toEqual({ language: 'hi-IN', autodetectAvailable: false, explicit: false })
  })

  it('adopts the locale the backend actually used, not the first candidate', () => {
    const next = learnFromTranscription(
      resting,
      null,
      { mode: 'forced', language: 'gu-IN' },
      OPTIONS,
      candidates
    )
    expect(next.language).toBe('gu-IN')
  })

  it('falls back to the default when the reported locale is not selectable', () => {
    const next = learnFromTranscription(
      resting,
      null,
      { mode: 'forced', language: 'xx-XX' },
      OPTIONS,
      candidates
    )
    expect(next.language).toBe('hi-IN')
  })

  it('learns nothing from a forced reply to a language we named', () => {
    const chosen = selectLanguage(resting, 'gu-IN')
    expect(
      learnFromTranscription(chosen, 'gu-IN', { mode: 'forced', language: 'gu-IN' }, OPTIONS, candidates)
    ).toBe(chosen)
  })

  it('leaves auto-detect alone when the backend auto-detected', () => {
    expect(
      learnFromTranscription(resting, null, { mode: 'autodetect', language: 'en-IN' }, OPTIONS, candidates)
    ).toBe(resting)
  })

  it('ignores a response with no mode at all', () => {
    // mode is optional on the client type; an older backend simply omits it.
    expect(learnFromTranscription(resting, null, undefined, OPTIONS, candidates)).toBe(resting)
    expect(learnFromTranscription(resting, null, { language: 'hi-IN' }, OPTIONS, candidates)).toBe(resting)
  })

  it('does not re-learn what it already knows', () => {
    const learned: DictationState = { language: 'gu-IN', autodetectAvailable: false, explicit: true }
    expect(
      learnFromTranscription(learned, null, { mode: 'forced', language: 'hi-IN' }, OPTIONS, candidates)
    ).toBe(learned)
  })
})

describe('compactLabel', () => {
  it('shows the endonym when it fits beside the mic', () => {
    expect(compactLabel(findOption(OPTIONS, 'gu-IN')!)).toBe('ગુજરાતી')
    expect(compactLabel(findOption(OPTIONS, 'ta-IN')!)).toBe('தமிழ்')
    expect(compactLabel(findOption(OPTIONS, 'en-US')!)).toBe('English')
  })

  it('falls back to the uppercased subtag when the endonym is too wide', () => {
    expect(compactLabel(findOption(OPTIONS, 'nl-NL')!)).toBe('NL')
  })
})

describe('secondaryLabel', () => {
  it('keeps the English name when the endonym is in another script', () => {
    expect(secondaryLabel(findOption(OPTIONS, 'gu-IN')!)).toBe('Gujarati (India)')
  })

  it('reduces to the region when the endonym already says the language', () => {
    // ~16 Arabic and ~10 English locales ship; the region is the part that
    // actually tells them apart.
    expect(secondaryLabel(findOption(OPTIONS, 'en-US')!)).toBe('United States')
    expect(secondaryLabel(findOption(OPTIONS, 'en-IN')!)).toBe('India')
  })

  it('says nothing when the two names are identical', () => {
    const [option] = buildLanguageOptions([
      { locale: 'zz-ZZ', locale_name: 'Testish', language_code: 'zzz', default_voice: 'v' },
    ])
    expect(secondaryLabel(option)).toBe('')
  })
})

describe('nativeLanguageName', () => {
  it('caches per locale so 153 formatters are not rebuilt on every mount', () => {
    expect(nativeLanguageName('ja-JP', 'ja')).toBe('日本語')
    expect(nativeLanguageName('ja-JP', 'ja')).toBe('日本語')
  })

  it('returns null for a subtag Intl echoes back unchanged', () => {
    expect(nativeLanguageName('en-US', 'zzz')).toBeNull()
  })
})
