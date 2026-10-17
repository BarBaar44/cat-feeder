# Cat Feeder Card: notes for working on this repo

HACS dashboard card (Lovelace) for the owner's cat feeder, run by Scheduler-component schedules. Repo `BarBaar44/cat-feeder`, card file `cat-feeder-card.js`, element `custom:cat-feeder-card`. Owner: BarBaar44 (Bb). Sister repos with the same conventions: [espresso-card](https://github.com/BarBaar44/espresso-card) (closest: same tile size and layout), [appliance-card](https://github.com/BarBaar44/appliance-card), [vacuum-card](https://github.com/BarBaar44/vacuum-card), [room-card](https://github.com/BarBaar44/room-card), [tesla-model3-card](https://github.com/BarBaar44/tesla-model3-card).

## Files

| File | Purpose |
|---|---|
| `cat-feeder-card.js` | The whole card: plain custom element, no build step, no dependencies. `FEEDER_DEFAULTS` holds the owner's entities, `FEEDER_COLORS` the colours, `FEEDER_ICON` / `FEEDER_KIBBLE` / `FEEDER_ZZZ` the drawn icon and its animated parts. |
| `tests/cat-feeder-card.test.js` | jsdom tests with a fixed clock: every detail line, missed and not missed, grace, schedule off, missed clearing, the 30 s refresh, timeslots and weekdays, feeding minute, error, actions, config errors, editor round trips. `npm test`. |
| `hacs.json` | HACS manifest (HA 2024.11+). |
| `README.md` | User docs, also the HACS info page. Keep the option, entity, detail line and colour tables in sync with the code. |
| `CHANGELOG.md` | One `## vX.Y.Z` section per release; the Release workflow uses it as the release notes. |
| `shot.png` | README image, linked by absolute raw URL so it renders in HACS. |
| `cat-feeder.yaml` | Minimal and full example configs. |

## The owner's setup

* `switch.schedule_cat_feeder_daily_8h`: Scheduler switch. On means the feeding automation is enabled; the feeder itself runs for seconds. Attributes used: `next_trigger`, `timeslots`, `weekdays`.
* `sensor.cat_feeder_last_feed`: template sensor, device_class timestamp, the last confirmed dispense. Set only when `sensor.cat_feeder_portions_per_day` goes up, so it means food came out; reconnect re-reports and the midnight reset don't change it. Attributes `portions` (normally 4) and `grams` (normally 32). `unknown` until the first feed after it was created.
* `binary_sensor.cat_feeder_error`.
* Measured: the confirmation arrives about 8 s after the START command (17:00:08 every day in the week of 9 Oct 2026).

## Rules to keep

* State order, first match wins: error, unavailable (no schedule known), off, feeding (60 s after a confirmed `last_feed`), on.
* Off is grey and shows just "Off" (Bb's choice): no detail line, never "Missed".
* Detail line: "Missed" beats the last feed. Missed = a schedule that is on, runs today, has a slot today more than `grace_minutes` ago, was switched on before that slot, and `last_feed` is not after the slot. Latest such slot wins.
* All day and time logic runs in HA's time zone (`hass.config.time_zone`) via Intl, never the browser's.
* Never crash on `unknown`, `unavailable` or a non-date `last_feed`: that is "No feed recorded".
* Visual editor (`CatFeederCardEditor`, on `ha-form`): fields show the defaults; only non-defaults are written; a cleared entity is written as `null`, cleared schedules or grace fall back to the default (the card needs them); unknown keys are kept. Keep `FEEDER_ENTITY_FIELDS` in sync with `FEEDER_DEFAULTS.entities`.
* The card never hardcodes service calls: tap (`toggle` on the first schedule), hold (`more-info`) and the error badge (`more-info` on the error sensor) go through `hass-action`.
* Layout: centred, the same grid as the Espresso Card (36px icon 17px from the top, name baseline 44px above the bottom; off hides the detail line and puts "Off" at 20px). Side padding is 3px because "Cat Feeder" needs 70px of the 76px at phone width. Short and long words switch by container query at 90px; nothing may truncate at 84px. Measure in a real browser (Playwright, `ha-card` stub without an inline `display`) after any text or layout change.
* Re-render only when one of the card's own entities changes, plus a 30 s refresh and a timer at the end of the feeding minute. DOM built once per config, updated in place.
* The whole file sits in one block scope so its top-level names cannot clash with sister cards loaded as classic scripts; `const VERSION` stays on its own line for the Release workflow.

## Releasing

1. Bump `VERSION`, add the CHANGELOG section, commit, push to `main`, check Validate is green.
2. The owner pushes the `vX.Y.Z` tag. **Never tag or release without the owner's explicit go.** Claude sessions here cannot push tags or create releases anyway.
3. Changes marked "no release yet" go to `main` without a version bump.
