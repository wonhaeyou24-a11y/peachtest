async function priorImportPhotoZip(zipFile, eds, label){
    if(typeof JSZip === 'undefined') return { error: 'ZIP 라이브러리(JSZip)를 불러오지 못했습니다. 인터넷 연결 후 다시 시도해 주세요.' };
    const zip = await JSZip.loadAsync(zipFile);
    const byName = new Map();
    zip.forEach((path, entry) => { if(entry.dir) return; const key = path.split('/').pop().normalize('NFC'); if(!byName.has(key)) byName.set(key, entry); });
    const targets = eds.filter(ed => ed && !ed.isDeleted && ed.priorPhotoFile);
    const now = new Date().toISOString();
    const out = { added: 0, missing: 0, already: 0, failed: 0 };
    for(let i = 0; i < targets.length; i++){
      const ed = targets[i];
      priorProgress((label || '전차 사진') + ' 연결 중… ' + (i + 1) + ' / ' + targets.length);
      if((ed.photos || []).some(p => p && p.prior && p.name === ed.priorPhotoFile)){ out.already++; continue; }
      const entry = byName.get(String(ed.priorPhotoFile).normalize('NFC'));
      if(!entry){ out.missing++; continue; }
      try{
        const blob = await priorResizeToBlob(await entry.async('blob'));
        if(!blob || !blob.size) throw new Error('이미지 변환 실패');
        const id = genId() + String(i);
        await idbPutPhotoBlob(id, blob, 'image/jpeg');
        if(!Array.isArray(ed.photos)) ed.photos = [];
        ed.photos.push({ id, photoRef: id, prior: true, name: ed.priorPhotoFile, mimeType: 'image/jpeg', blobSize: blob.size, createdAt: now });
        ed.updatedAt = now;
        out.added++;
      }catch(e){
        console.warn('전차 사진 연결 실패', ed.priorPhotoFile, e);
        out.failed++;
      }
    }
    priorProgress('');
    return out;
  }
async function priorResizeToBlob(blob){
    let src, w, h, closeFn = ()=>{};
    try{
      const bmp = await createImageBitmap(blob);
      src = bmp; w = bmp.width; h = bmp.height; closeFn = ()=>{ try{ bmp.close(); }catch(e){} };
    }catch(e){
      const url = URL.createObjectURL(blob);
      const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = ()=>rej(new Error('이미지를 열 수 없습니다')); i.src = url; });
      src = img; w = img.naturalWidth; h = img.naturalHeight; closeFn = ()=>{ URL.revokeObjectURL(url); };
    }
    const scale = Math.min(1, 1280 / Math.max(w, h));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(w * scale)); cv.height = Math.max(1, Math.round(h * scale));
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    closeFn();
    return await new Promise(res => cv.toBlob(b => res(b), 'image/jpeg', 0.78));
  }
function priorProgress(msg){
    const b = document.getElementById('priorProgressBox'); if(!b) return;
    if(msg){ b.textContent = msg; b.style.display = ''; } else { b.style.display = 'none'; }
  }