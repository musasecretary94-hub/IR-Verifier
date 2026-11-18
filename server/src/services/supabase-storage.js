const { createClient } = require('@supabase/supabase-js');

function createSupabaseStorage(config) {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('Supabase Storage credentials are required');
  }

  const client = createClient(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }
  );

  const bucket = config.supabaseStorageBucket || 'ir-verifier-photos';

  return {
    async upload(fileName, buffer, contentType) {
      const { error } = await client.storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType,
          upsert: false
        });

      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },

    async download(fileName) {
      const { data, error } = await client.storage
        .from(bucket)
        .download(fileName);

      if (error) throw new Error(`Storage download failed: ${error.message}`);

      return Buffer.from(await data.arrayBuffer());
    },

    async remove(fileName) {
      const { error } = await client.storage
        .from(bucket)
        .remove([fileName]);

      if (error) throw new Error(`Storage removal failed: ${error.message}`);
    }
  };
}

module.exports = { createSupabaseStorage };
