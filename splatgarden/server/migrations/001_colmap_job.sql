create table if not exists colmap_job (
  id              text primary key,
  user_id         text not null references "user"(id) on delete cascade,

  -- input
  filename        text not null,
  content_type    text,
  size_bytes      bigint,

  -- settings captured at submit time
  fps             int  not null default 2,
  quality         text not null default 'medium',
  max_dimension   int  not null default 1600,

  -- pipeline state
  status          text not null default 'pending',
    -- pending | uploaded | processing | done | failed
  source_object   text,
  output_object   text,
  error_message   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists colmap_job_user_created_idx
  on colmap_job(user_id, created_at desc);
