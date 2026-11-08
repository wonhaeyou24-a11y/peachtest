p = 'index.html'
b = open(p, 'rb').read().decode('utf-8')
crlf = '\r\n' in b
s = b.replace('\r\n', '\n')


def rep(o, n):
    global s
    assert s.count(o) == 1, (o[:60], s.count(o))
    s = s.replace(o, n)


rep(r"""    zip.forEach((path, entry) => { if(entry.dir) return; const key = path.split('/').pop().normalize('NFC'); if(!byName.has(key)) byName.set(key, entry); });
    const targets""", r"""    const looseKey = (n) => String(n || '').normalize('NFC').replace(/\.[A-Za-z0-9]+$/, '').replace(/^\d+[a-z]?[_\-\s]+/i, '').replace(/[\s_\-.,()·~]/g, '').toLowerCase();
    const byLoose = new Map();
    zip.forEach((path, entry) => { if(entry.dir) return; const key = path.split('/').pop().normalize('NFC'); if(!byName.has(key)) byName.set(key, entry); const lk = looseKey(key); if(lk && !byLoose.has(lk)) byLoose.set(lk, entry); });
    const findEntry = (name) => {
      const exact = byName.get(String(name).normalize('NFC'));
      if(exact) return exact;
      const lk = looseKey(name);
      if(!lk) return null;
      if(byLoose.has(lk)) return byLoose.get(lk);
      // 이름이 잘려 한쪽이 다른 쪽의 앞부분인 경우(앞 8글자 이상 같을 때만)
      if(lk.length >= 8){ for(const [k, e] of byLoose){ if(k.length >= 8 && (k.startsWith(lk) || lk.startsWith(k))) return e; } }
      return null;
    };
    const targets""")
rep(r"""      const entry = byName.get(String(ed.priorPhotoFile).normalize('NFC'));
      if(!entry){ out.missing++; continue; }""", r"""      const entry = findEntry(ed.priorPhotoFile);
      if(!entry){ out.missing++; continue; }""")
rep(r"""        (photoTotal ? '<button type="button" class="ghost" id="priorPrefetch" style="margin-left:auto;">⬇ 전차 사진 내려받기 (현장용)</button>' : '') +""",
    r"""        '<button type="button" class="ghost" id="priorRelink" title="사진이 안 보이면 전차 사진 ZIP(…_전차손상사진.zip)을 골라 이 시설물의 전차 손상에 다시 연결합니다">📷 사진 ZIP 연결' + (photoTotal ? '' : ' (사진 없음)') + '</button>' +
        (photoTotal ? '<button type="button" class="ghost" id="priorPrefetch" style="margin-left:auto;">⬇ 전차 사진 내려받기 (현장용)</button>' : '') +""")
rep(r"""    const pre = document.getElementById('priorPrefetch');
    if(pre) pre.addEventListener('click', priorPrefetchAll);""", r"""    const pre = document.getElementById('priorPrefetch');
    if(pre) pre.addEventListener('click', priorPrefetchAll);
    const rel = document.getElementById('priorRelink');
    if(rel) rel.addEventListener('click', ()=>{ openPriorImportPicker('add'); });""")
rep(r"""      alert('전차 사진 ' + added + '장을 연결했습니다.' + (missing ? '\n(ZIP에서 찾지 못한 사진 ' + missing + '건)' : ''));""",
    r"""      alert('전차 사진 ' + added + '장을 연결했습니다.' + (missing ? '\n(ZIP에서 찾지 못한 사진 ' + missing + '건 — 이 시설물의 전차자료(.json)와 같은 쌍의 ZIP 인지 확인해 주세요)' : '') + (!added && !missing ? '\n(이미 연결되어 있습니다)' : ''));""")
rep("const PS_BUILD = 'v188';", "const PS_BUILD = 'v189';")
open(p, 'wb').write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))
w = open('service-worker.js', 'rb').read().decode('utf-8').replace('v188', 'v189')
open('service-worker.js', 'wb').write(w.encode('utf-8'))
print('ok')
