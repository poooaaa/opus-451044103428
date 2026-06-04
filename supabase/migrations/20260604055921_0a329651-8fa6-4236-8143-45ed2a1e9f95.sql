CREATE TABLE IF NOT EXISTS public.popular_songs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT,
  thumbnail TEXT,
  track_url TEXT,
  duration_ms INTEGER DEFAULT 0,
  source TEXT DEFAULT 'applemusic',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.popular_songs TO anon;
GRANT SELECT ON public.popular_songs TO authenticated;
GRANT ALL ON public.popular_songs TO service_role;
ALTER TABLE public.popular_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read popular songs" ON public.popular_songs FOR SELECT USING (true);