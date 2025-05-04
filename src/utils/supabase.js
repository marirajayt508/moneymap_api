const { createClient } = require('@supabase/supabase-js');

/**
 * Create a Supabase client with the provided URL and key
 * @param {string} url - Supabase URL
 * @param {string} key - Supabase API key
 * @param {Object} options - Additional options
 * @returns {Object} Supabase client
 */
function createSupabaseClient(url, key, options = {}) {
  return createClient(url, key, options);
}

/**
 * Create a Supabase admin client that bypasses RLS
 * @param {string} url - Supabase URL
 * @param {string} serviceKey - Supabase service role key
 * @returns {Object} Supabase admin client
 */
function createSupabaseAdminClient(url, serviceKey) {
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        // This header is required to bypass RLS
        'X-Client-Info': 'supabase-admin'
      }
    }
  });
}

module.exports = {
  createSupabaseClient,
  createSupabaseAdminClient
};
