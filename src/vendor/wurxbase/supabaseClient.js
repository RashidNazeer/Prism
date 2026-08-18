import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnevtdezskftlrjjgbsg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h7DMRqJ19S3cWaEoUR9e8Q_b5FEAEyu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
