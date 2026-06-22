const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xudumzedcxuuhxokissm.supabase.co';
const supabaseKey = 'f34d58440823ea705a8e086b07596163f307bd215cd0922363f5a80c306fa48e';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // get user by email
  const { data: users, error: err1 } = await supabase.auth.admin.listUsers();
  const adminUser = users?.users?.find(u => u.email === 'nc.marketingrj@gmail.com');
  console.log("Auth user found:", adminUser?.id);
  
  if (adminUser) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', adminUser.id);
    console.log("Profile row:", profile);
    
    const { data: config } = await supabase.from('meta_ads_configs').select('*').eq('user_id', adminUser.id);
    console.log("Meta config row:", config);
  }
}

run();
