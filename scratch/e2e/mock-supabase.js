// 시험용 가짜 Supabase (메모리) — 실제 서버가 아니다. 호출 기록은 window.__mock.log 에 쌓인다.
(function () {
  const tables = {};
  const log = [];
  const session = { access_token: 'test-token', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'me', email: 'tester@local.test' } };
  const T = n => (tables[n] = tables[n] || []);
  function builder(tname) {
    const q = { op: 'select', f: [], single: false, maybe: false, payload: null, opts: null, count: null };
    const match = row => q.f.every(([k, t, v]) => (t === 'eq' ? row[k] === v : t === 'is' ? (v === null ? row[k] == null : row[k] === v) : t === 'in' ? v.includes(row[k]) : t === 'neq' ? row[k] !== v : true));
    const b = {
      select() { return b; }, order() { return b; }, range() { return b; }, limit() { return b; },
      eq(k, v) { q.f.push([k, 'eq', v]); return b; }, neq(k, v) { q.f.push([k, 'neq', v]); return b; },
      is(k, v) { q.f.push([k, 'is', v]); return b; }, in(k, v) { q.f.push([k, 'in', v]); return b; },
      gte() { return b; }, lte() { return b; }, or() { return b; }, not() { return b; }, ilike() { return b; },
      maybeSingle() { q.maybe = true; return b; }, single() { q.single = true; return b; },
      upsert(p, o) { q.op = 'upsert'; q.payload = p; q.opts = o || {}; return b; },
      insert(p) { q.op = 'insert'; q.payload = p; return b; },
      update(p) { q.op = 'update'; q.payload = p; return b; },
      delete() { q.op = 'delete'; return b; },
      then(res, rej) {
        try {
          let data = null;
          if (q.op === 'select') { data = T(tname).filter(match).map(r => JSON.parse(JSON.stringify(r))); }
          else if (q.op === 'upsert' || q.op === 'insert') {
            const arr = Array.isArray(q.payload) ? q.payload : [q.payload];
            arr.forEach(row => {
              log.push({ table: tname, op: q.op, row: JSON.parse(JSON.stringify(row)) });
              const key = (q.opts && q.opts.onConflict) || 'id';
              const i = T(tname).findIndex(r => r[key] === row[key]);
              if (i >= 0) T(tname)[i] = Object.assign({}, T(tname)[i], row); else T(tname).push(JSON.parse(JSON.stringify(row)));
            });
            data = arr;
          } else if (q.op === 'update') {
            T(tname).filter(match).forEach(r => { log.push({ table: tname, op: 'update', id: r.id, patch: JSON.parse(JSON.stringify(q.payload)) }); Object.assign(r, q.payload); });
          } else if (q.op === 'delete') {
            const keep = T(tname).filter(r => !match(r)); log.push({ table: tname, op: 'delete' }); tables[tname] = keep;
          }
          if (q.op === 'select' && (q.single || q.maybe)) data = data[0] || null;
          res({ data, error: null, count: Array.isArray(data) ? data.length : null });
        } catch (e) { (rej || res)({ data: null, error: { message: String(e && e.message || e) } }); }
      }
    };
    return b;
  }
  const noop = async () => ({ data: null, error: null });
  const client = {
    from: builder,
    rpc: async (name, args) => { log.push({ rpc: name }); return { data: null, error: null }; },
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({ data: { session, user: session.user }, error: null }),
      signUp: noop, signOut: noop, getUser: async () => ({ data: { user: session.user } })
    },
    storage: { from: () => ({ upload: noop, download: async () => ({ data: null, error: { message: 'none' } }), list: async () => ({ data: [], error: null }), remove: noop, createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
  };
  window.supabase = { createClient: () => client };
  window.__mock = { tables, log, session };
})();
