'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function ProfileSetup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // vom reține subscription-ul aici, ca să-l putem închide la cleanup
    let subscription: { unsubscribe: () => void } | null = null;

    const init = async () => {
      // 1) încearcă să iei sesiunea curentă
      const { data: { session }, error } = await supabase.auth.getSession();
      console.log('getSession ->', { session, error });

      if (session?.user) {
        setUserId(session.user.id);
        setLoading(false);
        return;
      }

      // 2) dacă nu e sesiune încă, ascultă schimbările de auth
      const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
        console.log('onAuthStateChange ->', { event: _event, newSession });
        if (newSession?.user) {
          setUserId(newSession.user.id);
          setLoading(false);
        }
      });
      subscription = data.subscription;

      // 3) fallback: după 1.5s, dacă tot nu avem user, mergem la login
      setTimeout(() => {
        if (!session?.user && !userId) {
          setLoading(false);
          router.push('/login');
        }
      }, 1500);
    };

    init();

    return () => {
      // cleanup listener
      if (subscription) subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setErr(null);

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, name }, { onConflict: 'id' });

    setSaving(false);
    if (error) {
      console.error('profiles upsert error:', error);
      setErr(error.message);
    } else {
      router.push('/dashboard');
    }
  };

  if (loading) {
    return <p style={{ maxWidth: 420, margin: '2rem auto' }}>Se verifică sesiunea…</p>;
  }

  if (!userId) {
    return (
      <div style={{ maxWidth: 420, margin: '2rem auto' }}>
        <p>Nu ești autentificat. <a href="/login">Mergi la login</a></p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '2rem auto' }}>
      <h1>Completează profilul</h1>
      <input
        placeholder="Numele tău"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ display: 'block', margin: '8px 0', width: '100%' }}
      />
      <button disabled={saving || !name} onClick={save}>
        {saving ? 'Se salvează…' : 'Salvează și continuă'}
      </button>
      {err && <p style={{ color: 'tomato' }}>{err}</p>}
    </div>
  );
}
