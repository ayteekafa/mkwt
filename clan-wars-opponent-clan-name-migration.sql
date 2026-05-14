alter table public.clan_wars_matches
  add column if not exists opponent_clan_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clan_wars_matches_opponent_clan_name_len'
      and conrelid = 'public.clan_wars_matches'::regclass
  ) then
    alter table public.clan_wars_matches
      add constraint clan_wars_matches_opponent_clan_name_len
      check (opponent_clan_name is null or char_length(opponent_clan_name) <= 48);
  end if;
end $$;
