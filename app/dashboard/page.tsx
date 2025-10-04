'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

type Food = {
  id: string;
  name: string;
  kcal_per_100g: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealItem = {
  id: string;
  meal_id: string;
  food_id: string;
  quantity_g: number;
  foods: Food; // joined row
};

export default function Dashboard() {
  const router = useRouter();

  // --- AUTH STATE ---
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // --- DATA STATE ---
  const [mealId, setMealId] = useState<string | null>(null);
  const [foods, setFoods] = useState<Food[]>([]);
  const [items, setItems] = useState<MealItem[]>([]);
  const [selectedFoodId, setSelectedFoodId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(100);
  const [err, setErr] = useState<string | null>(null);

  // ---------- AUTH: avoid flicker ----------
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        setLoadingAuth(false);
        return;
      }

      // listen for hydration
      const { data } = supabase.auth.onAuthStateChange((_evt, newSession) => {
        if (newSession?.user) {
          setUserId(newSession.user.id);
          setLoadingAuth(false);
        }
      });
      subscription = data.subscription;

      // only then, after a short delay, send to /login if still no user
      setTimeout(() => {
        if (!session?.user && !userId) {
          setLoadingAuth(false);
          router.push('/login');
        }
      }, 1200);
    };

    init();
    return () => { subscription?.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // ---------- LOAD FOODS ----------
  useEffect(() => {
    const loadFoods = async () => {
      const { data, error } = await supabase
        .from('foods')
        .select('id, name, kcal_per_100g, protein, carbs, fat')
        .order('name', { ascending: true })
        .limit(200);

      if (error) setErr(error.message);
      setFoods((data as unknown as Food[]) || []);
    };
    loadFoods();
  }, []);

  // ---------- ENSURE TODAY'S MEAL ----------
  useEffect(() => {
    if (!userId) return;

    const ensureMeal = async () => {
      const today = new Date().toISOString().slice(0, 10);

      const { data: existing, error: selErr } = await supabase
        .from('meals')
        .select('id')
        .eq('user_id', userId)
        .eq('date', today)
        .eq('meal_type', 'lunch')
        .maybeSingle();

      if (selErr) return setErr(selErr.message);

      if (existing?.id) return setMealId(existing.id);

      const { data: inserted, error: insErr } = await supabase
        .from('meals')
        .insert({ user_id: userId, date: today, meal_type: 'lunch' })
        .select('id')
        .single();

      if (insErr) return setErr(insErr.message);
      setMealId(inserted.id);
    };

    ensureMeal();
  }, [userId]);

  // ---------- ITEMS HELPERS ----------
  const mapItems = (rows: any[] | null): MealItem[] =>
    (rows ?? []).map((r: any) => ({
      id: String(r.id),
      meal_id: String(r.meal_id),
      food_id: String(r.food_id),
      quantity_g: Number(r.quantity_g),
      foods: {
        id: String(r.foods?.id),
        name: String(r.foods?.name),
        kcal_per_100g: Number(r.foods?.kcal_per_100g ?? 0),
        protein: Number(r.foods?.protein ?? 0),
        carbs: Number(r.foods?.carbs ?? 0),
        fat: Number(r.foods?.fat ?? 0),
      },
    }));

  // ---------- LOAD ITEMS FOR CURRENT MEAL ----------
  useEffect(() => {
    if (!mealId) return;

    const loadItems = async () => {
      const { data, error } = await supabase
        .from('meal_items')
        .select(
          'id, meal_id, food_id, quantity_g, foods ( id, name, kcal_per_100g, protein, carbs, fat )'
        )
        .eq('meal_id', mealId)
        .order('id');

      if (error) setErr(error.message);
      setItems(mapItems(data as any[]));
    };

    loadItems();
  }, [mealId]);

  // ---------- ADD ITEM ----------
  const addItem = async () => {
    setErr(null);
    if (!mealId || !selectedFoodId || quantity <= 0) return;

    const { error } = await supabase
      .from('meal_items')
      .insert({ meal_id: mealId, food_id: selectedFoodId, quantity_g: quantity });

    if (error) return setErr(error.message);

    const { data } = await supabase
      .from('meal_items')
      .select(
        'id, meal_id, food_id, quantity_g, foods ( id, name, kcal_per_100g, protein, carbs, fat )'
      )
      .eq('meal_id', mealId);

    setItems(mapItems(data as any[]));
    setQuantity(100);
    setSelectedFoodId('');
  };

  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => {
        const factor = it.quantity_g / 100;
        acc.kcal += it.foods.kcal_per_100g * factor;
        acc.protein += it.foods.protein * factor;
        acc.carbs += it.foods.carbs * factor;
        acc.fat += it.foods.fat * factor;
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [items]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ---------- RENDER ----------
  if (loadingAuth) {
    return <p style={{ maxWidth: 720, margin: '2rem auto' }}>Se verifică autentificarea…</p>;
  }
  if (!userId) {
    return <p style={{ maxWidth: 720, margin: '2rem auto' }}>Nu ești logat. <a href="/login">Login</a></p>;
  }

  return (
    <div style={{ maxWidth: 720, margin: '2rem auto' }}>
      <h1>Dashboard</h1>
      <button onClick={logout} style={{ marginBottom: 16 }}>Logout</button>

      {err && <p style={{ color: 'tomato' }}>{err}</p>}

      <div style={{ border: '1px solid #333', borderRadius: 8, padding: 16, marginTop: 8 }}>
        <h2>Adaugă aliment la masa de azi</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <select
            value={selectedFoodId}
            onChange={(e) => setSelectedFoodId(e.target.value)}
            style={{ padding: 8, minWidth: 260 }}
          >
            <option value="">Alege aliment…</option>
            {foods.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.kcal_per_100g} kcal/100g)
              </option>
            ))}
          </select>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            style={{ width: 100, padding: 8 }}
            min={1}
            step={1}
            placeholder="g"
          />
          <button onClick={addItem}>Adaugă</button>
        </div>
      </div>

      <div style={{ border: '1px solid #333', borderRadius: 8, padding: 16, marginTop: 16 }}>
        <h2>Iteme în masa de azi</h2>
        <ul>
          {items.map((it) => (
            <li key={it.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{it.foods.name} — {it.quantity_g}g</span>
              <span style={{ opacity: 0.8 }}>
                {Math.round(it.foods.kcal_per_100g * it.quantity_g / 100)} kcal
              </span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 12, opacity: 0.9 }}>
          <div><b>Total</b>: {Math.round(totals.kcal)} kcal</div>
          <div>Proteine: {totals.protein.toFixed(1)} g | Carbo: {totals.carbs.toFixed(1)} g | Grăsimi: {totals.fat.toFixed(1)} g</div>
        </div>
      </div>
    </div>
  );
}
