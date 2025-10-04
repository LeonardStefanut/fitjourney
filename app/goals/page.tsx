'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
  yearsBetween,
  mifflinStJeorBMR,
  tdee,
  macroTargets,
  Activity,
  GoalType,
} from '@/lib/nutrition';

type Gender = 'male' | 'female';

type Profile = {
  gender: Gender | null;
  birth_date: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  activity_level: Activity | null;
};

type Goal = {
  goal_type: GoalType;
  target_weight_kg: number | null;
  weekly_rate_kg: number; // ± kg / săpt
  protein_g_per_kg: number; // g/kg
};

// --- Parsere sigure pentru <select> (evită `any`)
function parseNullableGender(v: string): Gender | null {
  if (!v) return null;
  return v === 'male' || v === 'female' ? v : null;
}
function parseNullableActivity(v: string): Activity | null {
  if (!v) return null;
  const ok: Activity[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
  return ok.includes(v as Activity) ? (v as Activity) : null;
}
function parseGoalType(v: string): GoalType {
  const ok: GoalType[] = ['lose', 'maintain', 'gain'];
  return ok.includes(v as GoalType) ? (v as GoalType) : 'maintain';
}
function parseNumberOrNull(v: string): number | null {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function GoalsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [p, setP] = useState<Profile>({
    gender: null,
    birth_date: null,
    height_cm: null,
    weight_kg: null,
    activity_level: null,
  });
  const [g, setG] = useState<Goal>({
    goal_type: 'maintain',
    target_weight_kg: null,
    weekly_rate_kg: 0.25,
    protein_g_per_kg: 1.8,
  });

  // auth + load existing
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);

      const { data: prof } = await supabase
        .from('profiles')
        .select('gender, birth_date, height_cm, weight_kg, activity_level')
        .eq('id', user.id)
        .maybeSingle();

      if (prof) {
        setP({
          gender: prof.gender as Gender | null,
          birth_date: (prof.birth_date as string | null) ?? null,
          height_cm: (prof.height_cm as number | null) ?? null,
          weight_kg: (prof.weight_kg as number | null) ?? null,
          activity_level: prof.activity_level as Activity | null,
        });
      }

      const { data: goals } = await supabase
        .from('goals')
        .select('goal_type, target_weight_kg, weekly_rate_kg, protein_g_per_kg')
        .eq('user_id', user.id)
        .maybeSingle();

      if (goals) {
        setG({
          goal_type: (goals.goal_type as GoalType) ?? 'maintain',
          target_weight_kg: (goals.target_weight_kg as number | null) ?? null,
          weekly_rate_kg: (goals.weekly_rate_kg as number | null) ?? 0.25,
          protein_g_per_kg: (goals.protein_g_per_kg as number | null) ?? 1.8,
        });
      }

      setLoading(false);
    };
    init();
  }, [router]);

  // calcule live
  const result = useMemo(() => {
    if (!p.gender || !p.height_cm || !p.weight_kg || !p.activity_level || !p.birth_date) {
      return null;
    }
    const age = yearsBetween(new Date(p.birth_date));
    const bmr = mifflinStJeorBMR(p.gender, p.weight_kg, p.height_cm, age);
    let kcal = tdee(bmr, p.activity_level);

    if (g.goal_type === 'lose') kcal -= 500;
    if (g.goal_type === 'gain') kcal += 300;

    const macros = macroTargets(kcal, p.weight_kg, g.protein_g_per_kg);
    return { bmr: Math.round(bmr), kcal: Math.round(kcal), macros };
  }, [p, g]);

  const save = async () => {
    if (!userId) return;
    setErr(null);

    const { error: pErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          gender: p.gender,
          birth_date: p.birth_date,
          height_cm: p.height_cm,
          weight_kg: p.weight_kg,
          activity_level: p.activity_level,
        },
        { onConflict: 'id' }
      );
    if (pErr) {
      setErr(pErr.message);
      return;
    }

    const { error: gErr } = await supabase
      .from('goals')
      .upsert(
        {
          user_id: userId,
          goal_type: g.goal_type,
          target_weight_kg: g.target_weight_kg,
          weekly_rate_kg: g.weekly_rate_kg,
          protein_g_per_kg: g.protein_g_per_kg,
        },
        { onConflict: 'user_id' }
      );
    if (gErr) {
      setErr(gErr.message);
      return;
    }

    router.push('/dashboard');
  };

  if (loading) return <p style={{ maxWidth: 720, margin: '2rem auto' }}>Se încarcă…</p>;

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Obiective & Ținte zilnice</h1>
      {err && <p style={{ color: 'tomato' }}>{err}</p>}

      <h2 style={{ marginTop: 16 }}>Profil</h2>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <select
          value={p.gender ?? ''}
          onChange={(e) => setP((v) => ({ ...v, gender: parseNullableGender(e.target.value) }))}
        >
          <option value="">Gen</option>
          <option value="male">Masculin</option>
          <option value="female">Feminin</option>
        </select>

        <input
          type="date"
          value={p.birth_date ?? ''}
          onChange={(e) => setP((v) => ({ ...v, birth_date: e.target.value || null }))}
        />

        <input
          type="number"
          placeholder="Înălțime (cm)"
          value={p.height_cm ?? ''}
          onChange={(e) => setP((v) => ({ ...v, height_cm: parseNumberOrNull(e.target.value) }))}
        />

        <input
          type="number"
          placeholder="Greutate (kg)"
          value={p.weight_kg ?? ''}
          onChange={(e) => setP((v) => ({ ...v, weight_kg: parseNumberOrNull(e.target.value) }))}
        />

        <select
          value={p.activity_level ?? ''}
          onChange={(e) =>
            setP((v) => ({ ...v, activity_level: parseNullableActivity(e.target.value) }))
          }
        >
          <option value="">Activitate</option>
          <option value="sedentary">Sedentar</option>
          <option value="light">Ușoară</option>
          <option value="moderate">Moderat</option>
          <option value="active">Activ</option>
          <option value="very_active">Foarte activ</option>
        </select>
      </div>

      <h2 style={{ marginTop: 16 }}>Obiectiv</h2>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <select
          value={g.goal_type}
          onChange={(e) => setG((v) => ({ ...v, goal_type: parseGoalType(e.target.value) }))}
        >
          <option value="lose">Slăbire</option>
          <option value="maintain">Menținere</option>
          <option value="gain">Masă</option>
        </select>

        <input
          type="number"
          placeholder="Țintă greutate (kg)"
          value={g.target_weight_kg ?? ''}
          onChange={(e) =>
            setG((v) => ({ ...v, target_weight_kg: parseNumberOrNull(e.target.value) }))
          }
        />

        <input
          type="number"
          step="0.1"
          placeholder="Ritm (kg/săpt)"
          value={g.weekly_rate_kg}
          onChange={(e) => setG((v) => ({ ...v, weekly_rate_kg: Number(e.target.value) }))}
        />

        <input
          type="number"
          step="0.1"
          placeholder="Proteine (g/kg)"
          value={g.protein_g_per_kg}
          onChange={(e) => setG((v) => ({ ...v, protein_g_per_kg: Number(e.target.value) }))}
        />
      </div>

      {result && (
        <div style={{ marginTop: 16, border: '1px solid #333', borderRadius: 8, padding: 12 }}>
          <div>
            <b>BMR</b>: {result.bmr} kcal/zi
          </div>
          <div>
            <b>Țintă calorii</b>: {result.kcal} kcal/zi
          </div>
          <div>
            <b>Ținte macro</b> — Proteine: {result.macros.protein.toFixed(0)} g, Carbo:{' '}
            {result.macros.carbs.toFixed(0)} g, Grăsimi: {result.macros.fat.toFixed(0)} g
          </div>
        </div>
      )}

      <button onClick={save} style={{ marginTop: 16 }}>
        Salvează
      </button>
    </div>
  );
}
