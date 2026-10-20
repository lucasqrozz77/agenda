
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://wfcmdazlowhcdxxzhxax.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_svh3ECdrKG6BXHnfjJbdBQ__8-lZpJ-";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
