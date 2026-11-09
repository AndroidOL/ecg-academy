# Localization (i18n)

The site ships a Chinese/English interface and a machine-assisted English catalog for course content. Chinese remains the clinical source of truth.

## Runtime

- `public/static/js/i18n.js` owns the locale registry (`LOCALES`), dictionaries, exact-phrase map, dynamic rules (counts, dates, guest names) and the DOM walker.
- `public/static/js/i18n.map.js` — interface strings (~400 entries), generated from the UI scan.
- `public/static/js/i18n.content.js` — course strings (~8,300 entries), generated from `App\Content::all()` plus section-bank, glossary and ACLS scenario text. The catalog is loaded after first paint only in English mode to keep boot fast.
- Both catalogs are loaded only when the stored locale is `en`, with the same `?v=` cache key as `i18n.js`.
- Content names use the curated `en` field (`localizedName()`), independent of the machine catalog.

## Regeneration

```bash
# 1. UI strings: export visible text from the app (see /tmp/ui-scan.mjs during development),
#    then run the translator. Existing keys are skipped.
php scripts/translate_ui_en.php data/i18n/ui-source.json data/i18n/ui-en.json public/static/js/i18n.map.js 18

# 2. Content strings: extract unique Chinese strings from App\Content::all(),
#    split into shards, translate in parallel, then merge into data/i18n/content-en.json
#    and public/static/js/i18n.content.js.
```

Use `scripts/translate_catalog.php` for alignment-safe JSON-array translation (id echo) after catalog changes. The translator uses the configured OpenAI-compatible provider and never logs the API key. `scripts/validate_i18n.php` checks empty values, CJK leakage, digit loss and curated English titles.

## Coverage

- Interface: navigation, page titles, filters, counters, dates, form labels, empty states, footer.
- Content: article and diagnosis names, article sections, lists, objectives, key points, pearls.
- Not machine-translated: live AI answers, user-entered names and imported course-pack content. Practice explanations are composed from translated diagnosis fields.

## Clinical safety

English course text is machine-assisted and **pending clinical review**. The Chinese source is authoritative. The footer shows this notice in English mode. Do not treat translated text as a substitute for the source guidelines.

To add another locale, append an entry to `LOCALES`, provide a dictionary and text catalog, and map the language code in `setLocale()`.
