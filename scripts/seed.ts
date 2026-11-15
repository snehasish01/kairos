/**
 * Seed two test sessions (one per condition) to verify schema + Supabase connection.
 * Run: TEST_DATABASE=true npm run seed  (refuses the live pilot project)
 * (Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local)
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { assertTestDatabase } from './lib/test-db-guard'

assertTestDatabase('seed.ts')

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function seed() {
  // Insert two test participants (one anticipatory, one silent)
  const { data: participants, error: pErr } = await client
    .from('participants')
    .insert([
      { condition: 'anticipatory', age_range: '25-34', education: 'graduate' },
      { condition: 'silent',       age_range: '35-44', education: 'undergraduate' },
    ])
    .select()

  if (pErr) { console.error('participants insert failed:', pErr); process.exit(1) }
  console.log('participants:', participants)

  const [p1, p2] = participants!

  // Insert one session per participant
  const { data: sessions, error: sErr } = await client
    .from('sessions')
    .insert([
      {
        participant_id: p1.id,
        question: 'Should AI systems be allowed to make autonomous medical decisions?',
        prior_lean: 0.3,
        prior_reasons: 'Accuracy might exceed human doctors in narrow domains.',
      },
      {
        participant_id: p2.id,
        question: 'Is remote work better for productivity than office work?',
        prior_lean: -0.2,
        prior_reasons: 'Collaboration suffers without in-person presence.',
      },
    ])
    .select()

  if (sErr) { console.error('sessions insert failed:', sErr); process.exit(1) }
  console.log('sessions:', sessions)

  // Read them back to confirm
  const { data: readBack, error: rErr } = await client
    .from('sessions')
    .select('id, question, prior_lean, participants(condition)')
    .in('id', sessions!.map(s => s.id))

  if (rErr) { console.error('read-back failed:', rErr); process.exit(1) }
  console.log('read-back:', JSON.stringify(readBack, null, 2))
  console.log('\n✓ Seed complete — schema and connection verified.')
}

seed()
