const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://xudumzedcxuuhxokissm.supabase.co';
const supabaseKey = 'f34d58440823ea705a8e086b07596163f307bd215cd0922363f5a80c306fa48e';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: configs, error } = await supabase.from('meta_ads_configs').select('*');
  console.log("Configs:", configs);
}
run();
