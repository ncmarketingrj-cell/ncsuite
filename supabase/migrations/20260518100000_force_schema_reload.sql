-- Forcing schema cache reload in PostgREST
NOTIFY pgrst, 'reload schema';
