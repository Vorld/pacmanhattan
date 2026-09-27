-- Pac-Manhattan on Tiger Data (TimescaleDB). Own tables, prefixed pm_; the buildings table is read-only here.

-- every riddle outcome, landmark visit and catch, as a time series
create table if not exists pm_events (
  ts      timestamptz not null default now(),
  player  text not null,          -- anonymous id made once per browser
  borough text not null,
  place   text not null,          -- the task (or landmark) name
  kind    text not null,          -- solved: found before the name showed; found: after; revealed; landmark; caught
  secs    real                    -- seconds since the task started
);
select create_hypertable('pm_events', by_range('ts', interval '1 day'), if_not_exists => true);
create index if not exists pm_events_place_ts on pm_events (place, ts desc);

-- per place, per hour: how often a riddle is solved before the reveal, and how long it takes
create materialized view if not exists pm_riddle_hourly with (timescaledb.continuous) as
select time_bucket('1 hour', ts) as bucket, place,
       count(*) filter (where kind in ('solved', 'found')) as finds,
       count(*) filter (where kind = 'solved')             as solved,
       sum(secs) filter (where kind in ('solved', 'found')) as secs_sum,
       count(*) filter (where kind = 'caught')             as caught
from pm_events
group by 1, 2
with no data;
-- real-time: include events newer than the last refresh
alter materialized view pm_riddle_hourly set (timescaledb.materialized_only = false);
select add_continuous_aggregate_policy('pm_riddle_hourly', start_offset => interval '30 days', end_offset => interval '1 hour',
                                       schedule_interval => interval '10 minutes', if_not_exists => true);

-- "know the block": nearby-building lookups by coordinate
create index if not exists buildings_lat_lon on buildings (lat, lon);
