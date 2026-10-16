# Cat Feeder Card

![Cat Feeder Card](https://raw.githubusercontent.com/BarBaar44/cat-feeder/main/shot.png)

A small Lovelace tile for an automatic cat feeder that runs on [Scheduler](https://github.com/nielsfaber/scheduler-component) schedules: whether the feeding schedule is on, the next feed, when food last actually came out, a missed feed, and the feeder's error. One JavaScript file, no build step, no dependencies, no card_mod, no Jinja.

* **On:** green feeder, "Next 08:00" from the schedule, and the last confirmed feed: "Fed 17:00 · 32 g".
* **Feeding:** for a minute after a confirmed feed, kibble drops into the bowl and the bowl fills.
* **Missed:** a schedule that is on had a run today more than `grace_minutes` ago and no feed came after it: "Missed 08:00" in red.
* **Off:** the schedule is off: grey, just "Off", the cat dozes.
* **Error:** the error sensor is on: red with a badge (tap it for the sensor), the feeder shakes now and then. Wins over every other state.
* Centred like a Mushroom tile and level with one next to it. Fits 3 columns by 2 rows (about 120px). All animations stop under reduced motion. Refreshes every 30 s, so "Missed" and "yesterday" appear without a state change.

## Install

HACS > three dots > Custom repositories > add `https://github.com/BarBaar44/cat-feeder`, type **Dashboard**. Install, then reload the browser.

Needs HA 2024.11 or newer.

## Use

```yaml
type: custom:cat-feeder-card
grid_options:
  columns: 3
  rows: 2
```

More in [cat-feeder.yaml](cat-feeder.yaml).

Or use the card editor: it shows the name, the schedules, both entities and the grace time with the values in use, defaults included, plus tap and hold actions and colours. Clearing an entity switches that part off; clearing all schedules or the grace time goes back to the default. Only values that differ from the defaults are written to the YAML, and options the editor does not show, such as `grid_options`, are kept.

### Options

| Option          | Default                                       |
| --------------- | --------------------------------------------- |
| `name`          | `Cat Feeder`                                  |
| `schedules`     | `[switch.schedule_cat_feeder_daily_8h]`: Scheduler switches; on when any is on |
| `entities`      | see below                                     |
| `grace_minutes` | `10`: how long after a scheduled run a feed may take before it counts as missed |
| `tap_action`    | `toggle` the first schedule                   |
| `hold_action`   | `more-info` on the first schedule             |
| `colors`        | see below                                     |

A misspelled option or entity role shows an error card instead of being ignored.

### Entities

| Role        | Default                          |                                         |
| ----------- | -------------------------------- | --------------------------------------- |
| `last_feed` | `sensor.cat_feeder_last_feed`    | timestamp of the last confirmed dispense; attributes `grams` and `portions` (optional). `unknown` or `unavailable`: "No feed recorded". `null` switches it off |
| `error`     | `binary_sensor.cat_feeder_error` | on: the Error state. `null` switches it off |

### The detail line

| When                         | Wide tile                 | Narrow tile (phone) |
| ---------------------------- | ------------------------- | ------------------- |
| Last feed today              | Fed 17:00 · 32 g (portions when grams is missing) | Fed 17:00 |
| Yesterday                    | Fed yesterday 17:00       | Yesterday           |
| 2 to 6 days ago              | Fed Mon 17:00             | Fed Mon             |
| Older                        | Fed 3 Oct                 | Fed 3 Oct           |
| No feed known                | No feed recorded          | No feed             |
| Missed (beats the above)     | Missed 08:00              | Missed              |

The tooltip has the full date and time of the last feed. The schedule's run times come from its `timeslots` attribute (start of each slot), else from the time of its `next_trigger`; its `weekdays` attribute decides whether it runs today (`daily`, day names, `workday`, `weekend`). A run does not count as missed when the schedule was switched on after it, or when the schedule is off.

### Colours

`colors` keys, each any CSS colour or theme variable: `on` (green), `feeding` (green), `off` (grey), `error` (red), `missed` (red, the detail line), `unavailable` (grey). Each also exists as a `--cf-*` theme variable.

## Known limits

* The card knows when a feed was scheduled and when food came out, not why a feed failed; the error sensor covers that.
* A schedule's "switched on" time is reset by a Home Assistant restart, so a run missed before a restart on the same day is not reported after it.

## Licence

MIT
