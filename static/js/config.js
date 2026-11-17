// Supabase settings for the Hall of Fame.
// This is the *publishable* key (sb_publishable_…): it is meant to be public.
// Row-level security only allows reading; new scores can only be added through the
// validating submit_score() function. If these are blank or unreachable, the game
// still works fully and the Hall of Fame shows as offline.
window.OMM_CONFIG = {
  SUPABASE_URL: "https://iguwotwtnkaijacizdsi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xhHk1V84dGXr933QlNskSA_NhW0EvzQ",
  // Set to true only after migration_fractions_decimals.sql has been run in Supabase.
  NEW_MODE_BOARDS: true,
  // PREVIEW COPY: never submits scores to the real Hall of Fame
  READ_ONLY: true
};
