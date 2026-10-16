# Changelog

## v0.1.0

First release. A small tile for a cat feeder run by Scheduler schedules, next to the Espresso Card and in the style of the other cards.

### Added
* **States**, first match wins: Error (error sensor on, red with a badge that opens the sensor, the feeder shakes), Off (schedule off: grey, just "Off", the cat dozes), Feeding (the first minute after a confirmed feed: kibble drops, the bowl fills), On (green, "Next 08:00" from the schedule).
* **Last confirmed feed** from `last_feed` (a timestamp sensor, attributes `grams` and `portions`): "Fed 17:00 · 32 g" today, "Fed yesterday 17:00", "Fed Mon 17:00", the date when older, "No feed recorded" when unknown or unavailable. Full date and time in the tooltip.
* **Missed feed:** a schedule that is on had a run today more than `grace_minutes` (10) ago and no feed came after it: "Missed 08:00" in red, before the last feed line. Run times from the schedule's `timeslots` or `next_trigger`, run days from `weekdays`. A schedule that is off never gives "Missed".
* Refresh every 30 s, so "Missed" and "yesterday" appear without a state change.
* Tap toggles the schedule, hold opens more-info, both through Home Assistant's own action handler and configurable.
* Every entity overridable or switched off with `null`; every colour configurable with `colors`.
* Centred like a Mushroom tile, 3 columns by 2 rows, short words on narrow tiles. All animations stop under reduced motion.
