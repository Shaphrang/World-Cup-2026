-- =========================================================
-- FINAL POINTS SYSTEM CLEANUP + MIGRATION
-- Exact Score + One User Scorer + Multiple Admin Scorers + Time Bonus
-- =========================================================

begin;

-- =========================================================
-- 1. CLEAN OLD DATA
-- Deletes all predictions, match scorers, winners, and non-admin users.
-- Keeps teams, players, matches, banners, prize pools.
-- =========================================================

delete from public.winners;
delete from public.match_predictions;
delete from public.match_goals;

-- Make sure admin profile exists and is admin.
insert into public.profiles (
  id,
  full_name,
  phone,
  email,
  role,
  created_at,
  updated_at
)
select
  au.id,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    'Admin'
  ) as full_name,
  coalesce(
    au.raw_user_meta_data ->> 'phone',
    au.raw_user_meta_data ->> 'mobile_number',
    ''
  ) as phone,
  au.email,
  'admin',
  now(),
  now()
from auth.users au
where lower(au.email) = lower('worldcup.shillong.26@gmail.com')
on conflict (id)
do update set
  role = 'admin',
  email = excluded.email,
  updated_at = now();

-- Delete non-admin public profiles.
delete from public.profiles
where lower(coalesce(email, '')) <> lower('worldcup.shillong.26@gmail.com');

-- Delete non-admin Supabase Auth users.
-- If this fails in your Supabase project, delete users from Authentication > Users UI.
delete from auth.users
where lower(coalesce(email, '')) <> lower('worldcup.shillong.26@gmail.com');

commit;

-- =========================================================
-- 2. FINAL POINTS COLUMNS
-- total_goals_points is legacy. Keep it for compatibility, but do not use.
-- =========================================================

alter table public.match_predictions
add column if not exists time_points int not null default 0;

update public.match_predictions
set
  exact_score_points = 0,
  total_goals_points = 0,
  player_points = 0,
  time_points = 0,
  points_total = 0,
  is_evaluated = false;

comment on column public.match_predictions.exact_score_points
is '10 points only if predicted Team A and Team B score exactly match final score.';

comment on column public.match_predictions.player_points
is '5 points only if exact score is correct and selected player scored at least once.';

comment on column public.match_predictions.time_points
is '10 to 1 points only for exact-score users, based on earliest prediction time.';

comment on column public.match_predictions.points_total
is 'Final total points. If exact score is wrong, points_total is 0. Maximum 25.';

comment on column public.match_predictions.total_goals_points
is 'Legacy column. No longer used. Always reset to 0.';

-- =========================================================
-- 3. CLEAN DUPLICATE MATCH GOAL SCORERS
-- One player should appear once per match for scorer bonus.
-- Admin can still select multiple different scorers.
-- =========================================================

with duplicated_goals as (
  select
    id,
    row_number() over (
      partition by match_id, player_id
      order by created_at asc, id asc
    ) as rn
  from public.match_goals
  where player_id is not null
    and is_own_goal = false
)
delete from public.match_goals mg
using duplicated_goals dg
where mg.id = dg.id
  and dg.rn > 1;

create unique index if not exists idx_match_goals_unique_scorer_per_match
on public.match_goals (match_id, player_id)
where player_id is not null
  and is_own_goal = false;

-- =========================================================
-- 4. REMOVE OLD TOTAL-GOALS GROUP RPC
-- No longer required because total goals no longer gives points.
-- =========================================================

drop function if exists public.get_match_goal_prediction_groups(uuid);

-- Keep this optional RPC if you still want to show popular scorer picks.
-- It does not affect scoring.
-- public.get_match_player_prediction_groups(uuid)

-- =========================================================
-- 5. FINALIZE MATCH RPC
-- Admin enters final score + multiple match_goals.
-- User selected only one scorer.
-- Scorer bonus is given if user's selected scorer exists in match_goals.
-- =========================================================

create or replace function public.finalize_match(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches%rowtype;
  v_updated_count int;
  v_exact_count int;
  v_scorer_count int;
begin
  if not public.is_admin() then
    raise exception 'Only admin can finalize a match.';
  end if;

  select *
  into v_match
  from public.matches
  where id = p_match_id;

  if not found then
    raise exception 'Match not found.';
  end if;

  if v_match.team_a_score is null or v_match.team_b_score is null then
    raise exception 'Please enter final score before finalizing match.';
  end if;

  select count(*)
  into v_scorer_count
  from public.match_goals g
  where g.match_id = p_match_id
    and g.player_id is not null
    and g.is_own_goal = false;

  with prediction_base as (
    select
      p.id,
      p.match_id,
      p.predicted_player_id,
      p.created_at,
      (
        p.predicted_team_a_score = v_match.team_a_score
        and
        p.predicted_team_b_score = v_match.team_b_score
      ) as is_exact_correct
    from public.match_predictions p
    where p.match_id = p_match_id
  ),

  exact_ranks as (
    select
      pb.id,
      row_number() over (
        order by pb.created_at asc, pb.id asc
      ) as exact_rank
    from prediction_base pb
    where pb.is_exact_correct = true
  ),

  scored_predictions as (
    select
      pb.id,

      case
        when pb.is_exact_correct = true
        then 10
        else 0
      end as exact_score_points,

      case
        when pb.is_exact_correct = true
         and pb.predicted_player_id is not null
         and exists (
          select 1
          from public.match_goals g
          where g.match_id = pb.match_id
            and g.player_id = pb.predicted_player_id
            and g.is_own_goal = false
        )
        then 5
        else 0
      end as player_points,

      case
        when pb.is_exact_correct = true
         and er.exact_rank between 1 and 10
        then 11 - er.exact_rank
        else 0
      end as time_points

    from prediction_base pb
    left join exact_ranks er
      on er.id = pb.id
  )

  update public.match_predictions p
  set
    exact_score_points = sp.exact_score_points,
    total_goals_points = 0,
    player_points = sp.player_points,
    time_points = sp.time_points,
    points_total = sp.exact_score_points + sp.player_points + sp.time_points,
    is_evaluated = true,
    updated_at = now()
  from scored_predictions sp
  where p.id = sp.id;

  get diagnostics v_updated_count = row_count;

  select count(*)
  into v_exact_count
  from public.match_predictions p
  where p.match_id = p_match_id
    and p.predicted_team_a_score = v_match.team_a_score
    and p.predicted_team_b_score = v_match.team_b_score;

  update public.matches
  set
    status = 'completed',
    updated_at = now()
  where id = p_match_id;

  return jsonb_build_object(
    'success', true,
    'match_id', p_match_id,
    'maximum_points', 25,
    'exact_score_points', 10,
    'goal_scorer_bonus_points', 5,
    'time_bonus_max_points', 10,
    'actual_scorers_count', v_scorer_count,
    'exact_score_predictions', v_exact_count,
    'predictions_evaluated', v_updated_count,
    'rule', 'If exact score is wrong, all points are zero.',
    'scorer_rule', 'Admin can enter multiple actual scorers. User selects one scorer. If selected scorer is among actual scorers, scorer bonus is awarded.',
    'time_rule', 'Only exact-score predictions receive time bonus. Earlier exact-score predictions get higher time points.',
    'decision', 'Admin decision is final.'
  );
end;
$$;

grant execute on function public.finalize_match(uuid)
to authenticated;

-- =========================================================
-- 6. GET MATCH PARTICIPANTS RPC
-- Now includes time_points.
-- =========================================================

drop function if exists public.get_match_participants(uuid);

create or replace function public.get_match_participants(
  p_match_id uuid
)
returns table (
  prediction_id uuid,
  match_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  predicted_team_a_score int,
  predicted_team_b_score int,
  predicted_total_goals int,
  predicted_player_id uuid,
  predicted_player_name text,
  exact_score_points int,
  total_goals_points int,
  player_points int,
  time_points int,
  points_total int,
  is_evaluated boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as prediction_id,
    p.match_id,
    p.user_id,
    coalesce(nullif(trim(pr.full_name), ''), 'Participant') as full_name,
    pr.avatar_url,

    p.predicted_team_a_score,
    p.predicted_team_b_score,
    p.predicted_total_goals,

    p.predicted_player_id,
    pl.player_name as predicted_player_name,

    coalesce(p.exact_score_points, 0) as exact_score_points,
    0::int as total_goals_points,
    coalesce(p.player_points, 0) as player_points,
    coalesce(p.time_points, 0) as time_points,
    coalesce(p.points_total, 0) as points_total,

    coalesce(p.is_evaluated, false) as is_evaluated,
    p.created_at

  from public.match_predictions p
  join public.matches m on m.id = p.match_id
  join public.profiles pr on pr.id = p.user_id
  left join public.players pl on pl.id = p.predicted_player_id
  where p.match_id = p_match_id
    and (
      p.user_id = auth.uid()
      or public.is_admin()
      or now() >= m.prediction_lock_at
      or m.status in ('locked', 'live', 'completed', 'finalized')
    )
  order by
    coalesce(p.points_total, 0) desc,
    p.created_at asc,
    p.id asc;
$$;

grant execute on function public.get_match_participants(uuid)
to authenticated;

-- =========================================================
-- 7. PREDICTIONS VIEW
-- Keep total_goals_points as 0 legacy, add time_points.
-- =========================================================

drop view if exists public.predictions_view;

create view public.predictions_view
with (security_invoker = true)
as
select
  mp.id,
  mp.user_id,
  mp.match_id,

  fv.match_title,
  fv.stage,

  fv.team_a_id,
  fv.team_a_name,
  fv.team_a_short_name,
  fv.team_a_flag_url,

  fv.team_b_id,
  fv.team_b_name,
  fv.team_b_short_name,
  fv.team_b_flag_url,

  mp.predicted_team_a_score as team_a_score,
  mp.predicted_team_b_score as team_b_score,

  mp.predicted_player_id as scorer_id,
  pl.player_name as scorer_name,

  coalesce(mp.exact_score_points, 0) as exact_score_points,
  0::int as total_goals_points,
  coalesce(mp.player_points, 0) as player_points,
  coalesce(mp.time_points, 0) as time_points,
  coalesce(mp.points_total, 0) as points,

  case
    when mp.is_evaluated = true and mp.exact_score_points > 0 then 'exact_hit'
    when mp.is_evaluated = true then 'missed'
    else 'submitted'
  end as status,

  mp.is_evaluated,
  mp.created_at,
  mp.created_at as submitted_at,
  mp.updated_at

from public.match_predictions mp
join public.fixtures_view fv
  on fv.id = mp.match_id
left join public.players pl
  on pl.id = mp.predicted_player_id;

grant select on public.predictions_view to authenticated;

-- =========================================================
-- 8. PUBLIC MATCH PREDICTIONS RPC
-- Used by Prediction page and Winners page.
-- Returns time_points.
-- total_goals_points is always 0 legacy.
-- =========================================================

drop function if exists public.get_public_match_predictions(uuid, int, int);

create or replace function public.get_public_match_predictions(
  p_match_id uuid,
  p_limit int default 100,
  p_offset int default 0
)
returns table (
  rank_no bigint,
  total_count bigint,

  prediction_id uuid,
  match_id uuid,
  user_id uuid,

  full_name text,
  avatar_url text,

  predicted_team_a_score int,
  predicted_team_b_score int,

  predicted_player_id uuid,
  scorer_name text,

  exact_score_points int,
  total_goals_points int,
  player_points int,
  time_points int,
  points_total int,

  is_evaluated boolean,
  submitted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_predictions as (
    select
      mp.id as prediction_id,
      mp.match_id,
      mp.user_id,

      coalesce(nullif(trim(pr.full_name), ''), 'Participant') as full_name,
      pr.avatar_url,

      mp.predicted_team_a_score,
      mp.predicted_team_b_score,

      mp.predicted_player_id,
      pl.player_name as scorer_name,

      coalesce(mp.exact_score_points, 0) as exact_score_points,
      0::int as total_goals_points,
      coalesce(mp.player_points, 0) as player_points,
      coalesce(mp.time_points, 0) as time_points,
      coalesce(mp.points_total, 0) as points_total,

      coalesce(mp.is_evaluated, false) as is_evaluated,
      mp.created_at as submitted_at

    from public.match_predictions mp
    join public.matches m
      on m.id = mp.match_id
    join public.profiles pr
      on pr.id = mp.user_id
    left join public.players pl
      on pl.id = mp.predicted_player_id

    where mp.match_id = p_match_id
      and (
        mp.user_id = auth.uid()
        or public.is_admin()
        or now() >= m.prediction_lock_at
        or m.status in ('locked', 'live', 'completed', 'finalized')
      )
  ),

  ranked_predictions as (
    select
      row_number() over (
        order by
          points_total desc,
          submitted_at asc,
          prediction_id asc
      ) as rank_no,

      count(*) over () as total_count,

      *
    from visible_predictions
  )

  select
    ranked_predictions.rank_no,
    ranked_predictions.total_count,

    ranked_predictions.prediction_id,
    ranked_predictions.match_id,
    ranked_predictions.user_id,

    ranked_predictions.full_name,
    ranked_predictions.avatar_url,

    ranked_predictions.predicted_team_a_score,
    ranked_predictions.predicted_team_b_score,

    ranked_predictions.predicted_player_id,
    ranked_predictions.scorer_name,

    ranked_predictions.exact_score_points,
    ranked_predictions.total_goals_points,
    ranked_predictions.player_points,
    ranked_predictions.time_points,
    ranked_predictions.points_total,

    ranked_predictions.is_evaluated,
    ranked_predictions.submitted_at

  from ranked_predictions
  order by ranked_predictions.rank_no
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.get_public_match_predictions(uuid, int, int)
to anon, authenticated;

-- =========================================================
-- 9. LEADERBOARD VIEW
-- Removes total goals logic from ranking.
-- Adds time_points and time_bonus_hits.
-- =========================================================

drop view if exists public.leaderboard_view;

create view public.leaderboard_view
with (security_invoker = true)
as
with user_totals as (
  select
    pr.id as user_id,
    coalesce(nullif(trim(pr.full_name), ''), 'Participant') as full_name,
    pr.avatar_url,

    count(mp.id) filter (where mp.is_evaluated = true) as total_predictions,

    coalesce(sum(mp.points_total) filter (where mp.is_evaluated = true), 0)::int as total_points,
    coalesce(sum(mp.exact_score_points) filter (where mp.is_evaluated = true), 0)::int as exact_score_points,
    0::int as total_goals_points,
    coalesce(sum(mp.player_points) filter (where mp.is_evaluated = true), 0)::int as player_points,
    coalesce(sum(mp.time_points) filter (where mp.is_evaluated = true), 0)::int as time_points,

    count(mp.id) filter (
      where mp.is_evaluated = true
        and mp.exact_score_points > 0
    )::int as exact_score_hits,

    0::int as total_goals_hits,

    count(mp.id) filter (
      where mp.is_evaluated = true
        and mp.player_points > 0
    )::int as player_hits,

    count(mp.id) filter (
      where mp.is_evaluated = true
        and mp.time_points > 0
    )::int as time_bonus_hits

  from public.profiles pr
  left join public.match_predictions mp
    on mp.user_id = pr.id

  where pr.role = 'user'

  group by
    pr.id,
    pr.full_name,
    pr.avatar_url
)
select
  row_number() over (
    order by
      total_points desc,
      exact_score_hits desc,
      time_points desc,
      full_name asc nulls last
  )::int as rank_no,

  user_id,
  full_name,
  avatar_url,

  total_predictions::int,
  total_points,
  exact_score_points,
  total_goals_points,
  player_points,
  time_points,

  exact_score_hits,
  total_goals_hits,
  player_hits,
  time_bonus_hits

from user_totals
order by
  total_points desc,
  exact_score_hits desc,
  time_points desc,
  full_name asc nulls last;

grant select on public.leaderboard_view to authenticated;

-- =========================================================
-- 10. LEADERBOARD RPC
-- Keeps legacy total_goals fields as zero so old app does not crash.
-- Adds time_points and time_bonus_hits.
-- =========================================================

drop function if exists public.get_leaderboard();

create or replace function public.get_leaderboard()
returns table (
  rank_no int,
  user_id uuid,
  full_name text,
  avatar_url text,
  total_predictions int,
  total_points int,
  exact_score_points int,
  total_goals_points int,
  player_points int,
  time_points int,
  exact_score_hits int,
  total_goals_hits int,
  player_hits int,
  time_bonus_hits int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lb.rank_no,
    lb.user_id,
    lb.full_name,
    lb.avatar_url,
    lb.total_predictions,
    lb.total_points,
    lb.exact_score_points,
    lb.total_goals_points,
    lb.player_points,
    lb.time_points,
    lb.exact_score_hits,
    lb.total_goals_hits,
    lb.player_hits,
    lb.time_bonus_hits
  from public.leaderboard_view lb
  order by
    lb.total_points desc,
    lb.exact_score_hits desc,
    lb.time_points desc,
    lb.full_name asc;
$$;

grant execute on function public.get_leaderboard()
to anon, authenticated;

-- =========================================================
-- 11. LATEST MATCH WINNERS RPC
-- Only exact-score users with points can appear as winners.
-- =========================================================

drop function if exists public.get_latest_match_winners();

create or replace function public.get_latest_match_winners()
returns table (
  match_id uuid,
  match_title text,
  stage text,

  team_a_name text,
  team_a_short_name text,
  team_a_flag_url text,

  team_b_name text,
  team_b_short_name text,
  team_b_flag_url text,

  team_a_score integer,
  team_b_score integer,

  match_start_at timestamptz,
  match_status text,

  has_prediction boolean,

  prediction_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,

  predicted_team_a_score integer,
  predicted_team_b_score integer,
  predicted_player_id uuid,

  scorer_name text,
  scorer_team_name text,

  exact_score_points integer,
  total_goals_points integer,
  player_points integer,
  time_points integer,
  points_total integer,
  is_evaluated boolean,
  prediction_created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest_match as (
    select
      m.id as match_id,
      m.match_title,
      m.stage,

      ta.name as team_a_name,
      ta.short_name as team_a_short_name,
      ta.flag_url as team_a_flag_url,

      tb.name as team_b_name,
      tb.short_name as team_b_short_name,
      tb.flag_url as team_b_flag_url,

      m.team_a_score,
      m.team_b_score,
      m.match_start_at,
      m.status as match_status

    from public.matches m
    join public.teams ta on ta.id = m.team_a_id
    join public.teams tb on tb.id = m.team_b_id

    where lower(coalesce(m.status, '')) in ('completed', 'finalized')
      and m.team_a_score is not null
      and m.team_b_score is not null

    order by m.match_start_at desc nulls last
    limit 1
  )
  select
    lm.match_id,
    lm.match_title,
    lm.stage,

    lm.team_a_name,
    lm.team_a_short_name,
    lm.team_a_flag_url,

    lm.team_b_name,
    lm.team_b_short_name,
    lm.team_b_flag_url,

    lm.team_a_score,
    lm.team_b_score,

    lm.match_start_at,
    lm.match_status,

    mp.id is not null as has_prediction,

    mp.id as prediction_id,
    mp.user_id,
    coalesce(nullif(trim(pr.full_name), ''), 'Participant') as full_name,
    pr.avatar_url,

    mp.predicted_team_a_score,
    mp.predicted_team_b_score,
    mp.predicted_player_id,

    pl.player_name as scorer_name,
    pt.name as scorer_team_name,

    coalesce(mp.exact_score_points, 0) as exact_score_points,
    0::int as total_goals_points,
    coalesce(mp.player_points, 0) as player_points,
    coalesce(mp.time_points, 0) as time_points,
    coalesce(mp.points_total, 0) as points_total,
    coalesce(mp.is_evaluated, false) as is_evaluated,
    mp.created_at as prediction_created_at

  from latest_match lm
  join public.match_predictions mp
    on mp.match_id = lm.match_id
  join public.profiles pr
    on pr.id = mp.user_id
  left join public.players pl
    on pl.id = mp.predicted_player_id
  left join public.teams pt
    on pt.id = pl.team_id

  where mp.is_evaluated = true
    and mp.exact_score_points > 0
    and mp.points_total > 0

  order by
    mp.points_total desc,
    mp.created_at asc,
    mp.id asc;
$$;

grant execute on function public.get_latest_match_winners()
to anon, authenticated;

-- =========================================================
-- 12. HELPFUL INDEXES
-- =========================================================

create index if not exists idx_match_predictions_match_rank
on public.match_predictions (
  match_id,
  points_total desc,
  created_at asc
);

create index if not exists idx_match_predictions_user_evaluated
on public.match_predictions (
  user_id,
  is_evaluated,
  points_total desc
);

create index if not exists idx_match_predictions_time_points
on public.match_predictions (
  time_points desc
);

notify pgrst, 'reload schema';




drop function if exists public.get_home_popular_score_picks(text[], int);
drop function if exists public.get_home_popular_score_picks(int);

create or replace function public.get_home_popular_score_picks(
  p_limit int default 3
)
returns table (
  rank_no int,
  predicted_team_a_score int,
  predicted_team_b_score int,
  score_text text,
  total_picks bigint,
  total_predictions bigint,
  pick_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with completed_matches as (
    select
      m.id
    from public.matches m
    where lower(coalesce(m.status, '')) in ('completed', 'finalized')
      and m.team_a_score is not null
      and m.team_b_score is not null
  ),

  base as (
    select
      mp.predicted_team_a_score,
      mp.predicted_team_b_score
    from public.match_predictions mp
    join completed_matches cm
      on cm.id = mp.match_id
    where mp.predicted_team_a_score is not null
      and mp.predicted_team_b_score is not null
  ),

  total_count as (
    select count(*)::bigint as total_predictions
    from base
  ),

  grouped as (
    select
      b.predicted_team_a_score,
      b.predicted_team_b_score,
      count(*)::bigint as total_picks
    from base b
    group by
      b.predicted_team_a_score,
      b.predicted_team_b_score
  ),

  ranked as (
    select
      row_number() over (
        order by
          g.total_picks desc,
          g.predicted_team_a_score desc,
          g.predicted_team_b_score desc
      )::int as rank_no,
      g.predicted_team_a_score,
      g.predicted_team_b_score,
      concat(g.predicted_team_a_score, ' - ', g.predicted_team_b_score) as score_text,
      g.total_picks,
      tc.total_predictions,
      case
        when tc.total_predictions = 0 then 0
        else round((g.total_picks::numeric / tc.total_predictions::numeric) * 100, 1)
      end as pick_percent
    from grouped g
    cross join total_count tc
  )

  select
    r.rank_no,
    r.predicted_team_a_score,
    r.predicted_team_b_score,
    r.score_text,
    r.total_picks,
    r.total_predictions,
    r.pick_percent
  from ranked r
  order by r.rank_no
  limit least(greatest(p_limit, 1), 6);
$$;

grant execute on function public.get_home_popular_score_picks(int)
to anon, authenticated;

notify pgrst, 'reload schema';





-- =========================================================
-- APP LINKS / WHATSAPP GROUP LINK
-- =========================================================

create table if not exists public.app_links (
  id uuid not null default gen_random_uuid(),
  link_key text not null,
  title text not null,
  subtitle text null,
  button_text text not null default 'Join Group',
  url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_links_pkey primary key (id),
  constraint app_links_key_unique unique (link_key)
);

create index if not exists idx_app_links_key_active
on public.app_links (link_key, is_active);

drop trigger if exists trg_app_links_updated_at on public.app_links;

create trigger trg_app_links_updated_at
before update on public.app_links
for each row
execute function public.set_updated_at();

alter table public.app_links enable row level security;

drop policy if exists "Anyone can read app links" on public.app_links;
drop policy if exists "Admins can insert app links" on public.app_links;
drop policy if exists "Admins can update app links" on public.app_links;
drop policy if exists "Admins can delete app links" on public.app_links;

create policy "Anyone can read app links"
on public.app_links
for select
to anon, authenticated
using (true);

create policy "Admins can insert app links"
on public.app_links
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update app links"
on public.app_links
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete app links"
on public.app_links
for delete
to authenticated
using (public.is_admin());

grant select on public.app_links to anon, authenticated;
grant insert, update, delete on public.app_links to authenticated;

drop function if exists public.get_app_link(text);

create or replace function public.get_app_link(
  p_link_key text
)
returns table (
  id uuid,
  link_key text,
  title text,
  subtitle text,
  button_text text,
  url text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    al.id,
    al.link_key,
    al.title,
    al.subtitle,
    al.button_text,
    al.url,
    al.is_active,
    al.created_at,
    al.updated_at
  from public.app_links al
  where al.link_key = p_link_key
    and al.is_active = true
    and nullif(trim(al.url), '') is not null
  limit 1;
$$;

grant execute on function public.get_app_link(text)
to anon, authenticated;

notify pgrst, 'reload schema';




drop function if exists public.get_home_current_prize_pool();

create or replace function public.get_home_current_prize_pool()
returns table (
  match_id uuid,
  match_title text,
  stage text,

  team_a_name text,
  team_a_short_name text,
  team_a_flag_url text,

  team_b_name text,
  team_b_short_name text,
  team_b_flag_url text,

  match_start_at timestamptz,
  prediction_lock_at timestamptz,
  match_status text,
  is_prediction_locked boolean,
  seconds_to_lock int,

  is_current_match boolean,
  display_mode text,

  has_prize_pool boolean,
  prize_pool_id uuid,
  prize_title text,
  description text,
  prize_1 text,
  prize_2 text,
  prize_3 text,
  sponsor_name text,
  banner_image_url text,
  terms text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate_match as (
    select
      m.id,
      m.match_title,
      m.stage,
      m.team_a_id,
      m.team_b_id,
      m.match_start_at,
      m.prediction_lock_at,
      m.status,

      (
        lower(coalesce(m.status, '')) in ('live', 'ongoing')
        or (
          now() >= m.match_start_at
          and now() < m.match_start_at + interval '2 hours 30 minutes'
          and lower(coalesce(m.status, '')) not in (
            'completed',
            'finalized',
            'cancelled',
            'finished'
          )
        )
      ) as is_current_match

    from public.matches m
    where lower(coalesce(m.status, '')) not in (
      'completed',
      'finalized',
      'cancelled',
      'finished'
    )
    and (
      -- currently playing
      (
        now() >= m.match_start_at
        and now() < m.match_start_at + interval '2 hours 30 minutes'
      )

      -- or next upcoming
      or (
        m.match_start_at > now()
        and lower(coalesce(m.status, '')) in ('upcoming', 'locked')
      )

      -- or admin manually marked live
      or lower(coalesce(m.status, '')) in ('live', 'ongoing')
    )
    order by
      case
        when (
          lower(coalesce(m.status, '')) in ('live', 'ongoing')
          or (
            now() >= m.match_start_at
            and now() < m.match_start_at + interval '2 hours 30 minutes'
          )
        )
        then 0
        else 1
      end asc,

      -- if current match, prefer the latest started match
      case
        when (
          lower(coalesce(m.status, '')) in ('live', 'ongoing')
          or (
            now() >= m.match_start_at
            and now() < m.match_start_at + interval '2 hours 30 minutes'
          )
        )
        then m.match_start_at
      end desc,

      -- if no current match, take next upcoming match
      case
        when m.match_start_at > now()
        then m.match_start_at
      end asc

    limit 1
  )

  select
    cm.id as match_id,

    coalesce(
      nullif(trim(cm.match_title), ''),
      concat(ta.name, ' vs ', tb.name)
    ) as match_title,

    coalesce(cm.stage, '') as stage,

    ta.name as team_a_name,
    ta.short_name as team_a_short_name,
    ta.flag_url as team_a_flag_url,

    tb.name as team_b_name,
    tb.short_name as team_b_short_name,
    tb.flag_url as team_b_flag_url,

    cm.match_start_at,
    cm.prediction_lock_at,
    cm.status as match_status,

    case
      when now() >= cm.prediction_lock_at then true
      else false
    end as is_prediction_locked,

    greatest(
      0,
      floor(extract(epoch from (cm.prediction_lock_at - now())))::int
    ) as seconds_to_lock,

    cm.is_current_match,

    case
      when cm.is_current_match then 'current'
      else 'upcoming'
    end as display_mode,

    case
      when mpp.id is not null then true
      else false
    end as has_prize_pool,

    mpp.id as prize_pool_id,
    mpp.title as prize_title,
    mpp.description,
    mpp.prize_1,
    mpp.prize_2,
    mpp.prize_3,
    mpp.sponsor_name,
    mpp.banner_image_url,
    mpp.terms,
    mpp.starts_at,
    mpp.ends_at

  from candidate_match cm

  join public.teams ta
    on ta.id = cm.team_a_id

  join public.teams tb
    on tb.id = cm.team_b_id

  left join lateral (
    select *
    from public.match_prize_pools mpp
    where mpp.match_id = cm.id
      and mpp.is_active = true
      and (
        mpp.starts_at is null
        or mpp.starts_at <= now()
      )
      and (
        mpp.ends_at is null
        or mpp.ends_at >= now()
      )
    order by mpp.created_at desc
    limit 1
  ) mpp on true;
$$;

grant execute on function public.get_home_current_prize_pool()
to anon, authenticated;

notify pgrst, 'reload schema';





-- =========================================================
-- MATCH PRIZE POOL: SPONSORED BUSINESS CARD UPGRADE
-- For Variation 02 - Compact Offer Card
-- =========================================================

-- 1. Add missing fields to match_prize_pools

alter table public.match_prize_pools
add column if not exists card_variant text not null default 'compact_offer',

add column if not exists sponsor_badge_text text not null default 'SPONSORED',
add column if not exists sponsor_label text not null default 'OFFICIAL MATCH SPONSOR',

add column if not exists sponsor_business_name text null,
add column if not exists sponsor_location text null,
add column if not exists sponsor_logo_url text null,
add column if not exists sponsor_hero_image_url text null,
add column if not exists sponsor_link_url text null,
add column if not exists sponsor_cta_text text not null default 'Visit Sponsor',

add column if not exists reward_title text not null default 'PREDICT & WIN EXCLUSIVE REWARDS!',
add column if not exists highlight_text text null default 'Watch, predict and win exclusive gifts from our match partner.',

add column if not exists prize_1_subtitle text null,
add column if not exists prize_2_subtitle text null,
add column if not exists prize_3_subtitle text null,

add column if not exists prize_1_icon text not null default 'voucher',
add column if not exists prize_2_icon text not null default 'dinner',
add column if not exists prize_3_icon text not null default 'jersey',

add column if not exists sponsor_features jsonb not null default '[]'::jsonb;


-- 2. Helpful indexes

create index if not exists idx_match_prize_pools_active_dates
on public.match_prize_pools (
  match_id,
  is_active,
  starts_at,
  ends_at
);

create index if not exists idx_match_prize_pools_sponsor_name
on public.match_prize_pools (
  sponsor_business_name
);


-- 3. Create dedicated storage bucket for prize pool images
-- 500000 bytes is roughly 500 KB.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'match-prize-pools',
  'match-prize-pools',
  true,
  500000,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- 4. Storage policies
-- Public can view images.
-- Only admin can upload/update/delete images.

drop policy if exists "Match prize pool public read" on storage.objects;
create policy "Match prize pool public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'match-prize-pools');

drop policy if exists "Match prize pool admin insert" on storage.objects;
create policy "Match prize pool admin insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'match-prize-pools'
  and public.is_admin()
);

drop policy if exists "Match prize pool admin update" on storage.objects;
create policy "Match prize pool admin update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'match-prize-pools'
  and public.is_admin()
)
with check (
  bucket_id = 'match-prize-pools'
  and public.is_admin()
);

drop policy if exists "Match prize pool admin delete" on storage.objects;
create policy "Match prize pool admin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'match-prize-pools'
  and public.is_admin()
);


-- 5. Secure match_prize_pools RLS
-- Current open insert/update/delete should be removed for live app.

alter table public.match_prize_pools enable row level security;

drop policy if exists "Allow read prize pools" on public.match_prize_pools;
drop policy if exists "Allow insert prize pools" on public.match_prize_pools;
drop policy if exists "Allow update prize pools" on public.match_prize_pools;
drop policy if exists "Allow delete prize pools" on public.match_prize_pools;

drop policy if exists "Anyone can read active prize pools" on public.match_prize_pools;
create policy "Anyone can read active prize pools"
on public.match_prize_pools
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins can insert prize pools" on public.match_prize_pools;
create policy "Admins can insert prize pools"
on public.match_prize_pools
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update prize pools" on public.match_prize_pools;
create policy "Admins can update prize pools"
on public.match_prize_pools
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete prize pools" on public.match_prize_pools;
create policy "Admins can delete prize pools"
on public.match_prize_pools
for delete
to authenticated
using (public.is_admin());

revoke insert, update, delete on public.match_prize_pools from anon;
grant select on public.match_prize_pools to anon, authenticated;
grant insert, update, delete on public.match_prize_pools to authenticated;


-- 6. Update home current prize pool RPC
-- This returns one clean payload for the Flutter home card.

drop function if exists public.get_home_current_prize_pool();

create or replace function public.get_home_current_prize_pool()
returns table (
  match_id uuid,
  match_title text,
  stage text,

  team_a_name text,
  team_a_short_name text,
  team_a_flag_url text,

  team_b_name text,
  team_b_short_name text,
  team_b_flag_url text,

  match_start_at timestamptz,
  prediction_lock_at timestamptz,
  match_status text,
  is_prediction_locked boolean,
  seconds_to_lock int,

  is_current_match boolean,
  display_mode text,
  fans_count bigint,

  has_prize_pool boolean,
  prize_pool_id uuid,

  card_variant text,
  sponsor_badge_text text,
  sponsor_label text,

  sponsor_name text,
  sponsor_business_name text,
  sponsor_location text,
  sponsor_logo_url text,
  sponsor_hero_image_url text,
  sponsor_link_url text,
  sponsor_cta_text text,

  prize_title text,
  description text,
  reward_title text,
  highlight_text text,

  prize_1 text,
  prize_1_subtitle text,
  prize_1_icon text,

  prize_2 text,
  prize_2_subtitle text,
  prize_2_icon text,

  prize_3 text,
  prize_3_subtitle text,
  prize_3_icon text,

  terms text,
  starts_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with candidate_match as (
    select
      m.id,
      m.match_title,
      m.stage,
      m.team_a_id,
      m.team_b_id,
      m.match_start_at,
      m.prediction_lock_at,
      m.status,

      (
        lower(coalesce(m.status, '')) in ('live', 'ongoing')
        or (
          now() >= m.match_start_at
          and now() < m.match_start_at + interval '2 hours 30 minutes'
          and lower(coalesce(m.status, '')) not in (
            'completed',
            'finalized',
            'cancelled',
            'canceled',
            'finished'
          )
        )
      ) as is_current_match

    from public.matches m
    where lower(coalesce(m.status, '')) not in (
      'completed',
      'finalized',
      'cancelled',
      'canceled',
      'finished'
    )
    and (
      (
        now() >= m.match_start_at
        and now() < m.match_start_at + interval '2 hours 30 minutes'
      )
      or (
        m.match_start_at > now()
        and lower(coalesce(m.status, '')) in ('upcoming', 'locked')
      )
      or lower(coalesce(m.status, '')) in ('live', 'ongoing')
    )
    order by
      case
        when (
          lower(coalesce(m.status, '')) in ('live', 'ongoing')
          or (
            now() >= m.match_start_at
            and now() < m.match_start_at + interval '2 hours 30 minutes'
          )
        )
        then 0
        else 1
      end asc,

      case
        when (
          lower(coalesce(m.status, '')) in ('live', 'ongoing')
          or (
            now() >= m.match_start_at
            and now() < m.match_start_at + interval '2 hours 30 minutes'
          )
        )
        then m.match_start_at
      end desc,

      case
        when m.match_start_at > now()
        then m.match_start_at
      end asc

    limit 1
  ),

  fan_counts as (
    select
      mp.match_id,
      count(*)::bigint as fans_count
    from public.match_predictions mp
    group by mp.match_id
  )

  select
    cm.id as match_id,

    coalesce(
      nullif(trim(cm.match_title), ''),
      concat(ta.name, ' vs ', tb.name)
    ) as match_title,

    coalesce(cm.stage, '') as stage,

    ta.name as team_a_name,
    ta.short_name as team_a_short_name,
    ta.flag_url as team_a_flag_url,

    tb.name as team_b_name,
    tb.short_name as team_b_short_name,
    tb.flag_url as team_b_flag_url,

    cm.match_start_at,
    cm.prediction_lock_at,
    cm.status as match_status,

    case
      when now() >= cm.prediction_lock_at
        or lower(coalesce(cm.status, '')) in (
          'locked',
          'live',
          'ongoing',
          'completed',
          'finalized',
          'finished',
          'cancelled',
          'canceled'
        )
      then true
      else false
    end as is_prediction_locked,

    greatest(
      0,
      floor(extract(epoch from (cm.prediction_lock_at - now())))::int
    ) as seconds_to_lock,

    cm.is_current_match,

    case
      when cm.is_current_match then 'current'
      else 'upcoming'
    end as display_mode,

    coalesce(fc.fans_count, 0) as fans_count,

    case
      when mpp.id is not null then true
      else false
    end as has_prize_pool,

    mpp.id as prize_pool_id,

    coalesce(mpp.card_variant, 'compact_offer') as card_variant,
    coalesce(mpp.sponsor_badge_text, 'SPONSORED') as sponsor_badge_text,
    coalesce(mpp.sponsor_label, 'OFFICIAL MATCH SPONSOR') as sponsor_label,

    mpp.sponsor_name,
    coalesce(mpp.sponsor_business_name, mpp.sponsor_name) as sponsor_business_name,
    mpp.sponsor_location,
    mpp.sponsor_logo_url,
    coalesce(mpp.sponsor_hero_image_url, mpp.banner_image_url) as sponsor_hero_image_url,
    mpp.sponsor_link_url,
    coalesce(mpp.sponsor_cta_text, 'Visit Sponsor') as sponsor_cta_text,

    mpp.title as prize_title,
    mpp.description,
    coalesce(mpp.reward_title, 'PREDICT & WIN EXCLUSIVE REWARDS!') as reward_title,
    mpp.highlight_text,

    mpp.prize_1,
    mpp.prize_1_subtitle,
    coalesce(mpp.prize_1_icon, 'voucher') as prize_1_icon,

    mpp.prize_2,
    mpp.prize_2_subtitle,
    coalesce(mpp.prize_2_icon, 'dinner') as prize_2_icon,

    mpp.prize_3,
    mpp.prize_3_subtitle,
    coalesce(mpp.prize_3_icon, 'jersey') as prize_3_icon,

    mpp.terms,
    mpp.starts_at,
    mpp.ends_at

  from candidate_match cm

  join public.teams ta
    on ta.id = cm.team_a_id

  join public.teams tb
    on tb.id = cm.team_b_id

  left join fan_counts fc
    on fc.match_id = cm.id

  left join lateral (
    select *
    from public.match_prize_pools mpp
    where mpp.match_id = cm.id
      and mpp.is_active = true
      and (
        mpp.starts_at is null
        or mpp.starts_at <= now()
      )
      and (
        mpp.ends_at is null
        or mpp.ends_at >= now()
      )
    order by mpp.created_at desc
    limit 1
  ) mpp on true;
$$;

grant execute on function public.get_home_current_prize_pool()
to anon, authenticated;

notify pgrst, 'reload schema';