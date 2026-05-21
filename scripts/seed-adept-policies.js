#!/usr/bin/env node

/**
 * seed-adept-policies.js
 *
 * Usage:
 *   export SUPABASE_URL="YOUR_URL"
 *   export SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
 *   node scripts/seed-adept-policies.js <data.json>
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://smiifcbmmtolimtaxpip.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaWlmY2JtbXRvbGltdGF4cGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTM4MzgsImV4cCI6MjA5Mzg4OTgzOH0.9pMRTaWDqXqWb_Ttti93dj8-FXgQMjAAbIZL5E-zN54';

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ Warning: SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Using the anon key from js/main.js, which may fail due to Row-Level Security (RLS).");
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node seed-adept-policies.js <data.json>');
    process.exitCode = 1;
    return;
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exitCode = 1;
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(absPath, 'utf8'));
  } catch (e) {
    console.error(`JSON Parse Error: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  // 1. Insert new generals
  if (data.new_generals && Array.isArray(data.new_generals) && data.new_generals.length > 0) {
    console.log(`Inserting ${data.new_generals.length} new generals...`);
    try {
      const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/generals_static`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates' // ON CONFLICT DO NOTHING
        },
        body: JSON.stringify(data.new_generals)
      });
      if (!insertRes.ok) {
          throw new Error(`Insert failed: ${await insertRes.text()}`);
      }
      console.log('Successfully inserted new generals.');
    } catch (e) {
      console.error('Error inserting new generals:', e);
    }
  } else {
    console.log('No new generals to insert.');
  }

  // 2. Rename Cai Yan
  if (data.rename && data.rename.original_name && data.rename.update_to) {
    console.log(`Renaming ${data.rename.original_name}...`);
    try {
      const renameRes = await fetch(`${SUPABASE_URL}/rest/v1/generals_static?name=eq.${encodeURIComponent(data.rename.original_name)}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data.rename.update_to)
      });
      if (!renameRes.ok) {
          throw new Error(`Rename failed: ${await renameRes.text()}`);
      }
      console.log(`Successfully renamed ${data.rename.original_name}.`);
    } catch(e) {
      console.error(`Error renaming ${data.rename.original_name}:`, e);
    }
  }

  // 3. Update suitable_roles
  if (data.adept_updates && Array.isArray(data.adept_updates) && data.adept_updates.length > 0) {
    console.log(`Updating suitable_roles for ${data.adept_updates.length} generals...`);
    try {
        // Fetch current suitable_roles to append
        const allGeneralsRes = await fetch(`${SUPABASE_URL}/rest/v1/generals_static?select=name,suitable_roles`, {
          headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': 'Bearer ' + SUPABASE_KEY,
          }
        });
        if (!allGeneralsRes.ok) throw new Error(`Fetch failed: ${await allGeneralsRes.text()}`);
        const allGenerals = await allGeneralsRes.json();

        const generalMap = new Map(allGenerals.map(g => [g.name, g.suitable_roles || []]));

        let count = 0;
        let updatePromises = [];

        for (const update of data.adept_updates) {
          const currentRoles = generalMap.get(update.name) || [];
          // prevent duplicate additions just in case
          const rolesToAdd = update.add_roles.filter(r => !currentRoles.includes(r));
          if (rolesToAdd.length === 0) continue;

          const newRoles = [...currentRoles, ...rolesToAdd];

          const p = fetch(`${SUPABASE_URL}/rest/v1/generals_static?name=eq.${encodeURIComponent(update.name)}`, {
              method: 'PATCH',
              headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': 'Bearer ' + SUPABASE_KEY,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ suitable_roles: newRoles })
          }).then(async (updateRes) => {
             if (!updateRes.ok) {
                console.error(`Failed to update ${update.name}: ${await updateRes.text()}`);
             } else {
                count++;
             }
          });
          updatePromises.push(p);

          // chunk requests to prevent overload if there are hundreds
          if (updatePromises.length >= 50) {
            await Promise.all(updatePromises);
            updatePromises = [];
          }
        }

        if (updatePromises.length > 0) {
           await Promise.all(updatePromises);
        }
        console.log(`Successfully updated suitable_roles for ${count} generals.`);

    } catch(e) {
      console.error('Error updating suitable_roles:', e);
    }
  } else {
    console.log('No suitable_roles updates.');
  }
}

main();
