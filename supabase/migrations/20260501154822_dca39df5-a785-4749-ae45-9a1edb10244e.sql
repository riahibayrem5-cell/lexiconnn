CREATE TABLE public.book_dossiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  book_id UUID NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  dossier JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  extended_at TIMESTAMP WITH TIME ZONE,
  extension_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, book_id)
);

ALTER TABLE public.book_dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dossiers"
ON public.book_dossiers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own dossiers"
ON public.book_dossiers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dossiers"
ON public.book_dossiers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dossiers"
ON public.book_dossiers FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_book_dossiers_updated_at
BEFORE UPDATE ON public.book_dossiers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_book_dossiers_user_book ON public.book_dossiers(user_id, book_id);