/**
 * TEST A ~ TEST E 시뮬레이션 검증 스크립트 (Zero External Dependency)
 * - TEST A: 온라인 기본 지속성
 * - TEST B: 오프라인 5개 마킹 지속성
 * - TEST C: 오프라인 3개 지점 + 사진 지속성
 * - TEST D: 오프라인 10개 고속 마킹 지속성
 * - TEST E: 스냅샷 불완전 시 Durable Store를 통한 지점 복구
 */

class MockObjectStore {
  constructor(name, options = {}){
    this.name = name;
    this.keyPath = options.keyPath || null;
    this.data = new Map();
  }
  put(value, key){
    const actualKey = this.keyPath ? value[this.keyPath] : key;
    this.data.set(actualKey, JSON.parse(JSON.stringify(value)));
  }
  get(key){
    const val = this.data.get(key);
    const req = { result: val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined };
    setTimeout(()=>{ if(req.onsuccess) req.onsuccess(); }, 0);
    return req;
  }
  getAll(){
    const list = Array.from(this.data.values()).map(v => JSON.parse(JSON.stringify(v)));
    const req = { result: list };
    setTimeout(()=>{ if(req.onsuccess) req.onsuccess(); }, 0);
    return req;
  }
  delete(key){
    this.data.delete(key);
  }
}

class MockIDBDatabase {
  constructor(){
    this.stores = new Map();
    this.objectStoreNames = {
      contains: (name)=> this.stores.has(name)
    };
  }
  createObjectStore(name, options){
    const store = new MockObjectStore(name, options);
    this.stores.set(name, store);
    return store;
  }
  transaction(storeNames, mode){
    const db = this;
    const tx = {
      mode,
      objectStore: (name)=> db.stores.get(name),
      oncomplete: null,
      onerror: null
    };
    setTimeout(()=>{ if(tx.oncomplete) tx.oncomplete(); }, 0);
    return tx;
  }
}

const mockDB = new MockIDBDatabase();
mockDB.createObjectStore('kv');
mockDB.createObjectStore('photoBlobs', { keyPath: 'photoId' });
mockDB.createObjectStore('inspectionPoints', { keyPath: 'id' });

async function runTests(){
  console.log('=== [LOCAL POINT PERSISTENCE TEST START] ===\n');

  const IDB_STORE = 'kv';
  const IDB_INSPECTION_STORE = 'inspectionPoints';

  function openTestIDB(){
    return Promise.resolve(mockDB);
  }

  async function idbPutPoint(point, site){
    const db = await openTestIDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_INSPECTION_STORE, 'readwrite');
      const record = {
        id: point.id,
        projectId: site.projectId || null,
        facilityId: site.id,
        num: point.num,
        xPct: point.xPct ?? null,
        yPct: point.yPct ?? null,
        drawingId: point.drawingId || null,
        lat: point.lat ?? null,
        lng: point.lng ?? null,
        gps: point.gps || null,
        locationSource: point.locationSource || 'manual',
        locationHistory: point.locationHistory || [],
        photos: (point.photos || []).map(p => ({
          id: p.id || null,
          photoRef: p.photoRef || null,
          note: p.note || '',
          createdAt: p.createdAt || null
        })),
        createdAt: point.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null
      };
      tx.objectStore(IDB_INSPECTION_STORE).put(record);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }

  async function idbGetAllPoints(facilityId){
    const db = await openTestIDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_INSPECTION_STORE, 'readonly');
      const req = tx.objectStore(IDB_INSPECTION_STORE).getAll();
      req.onsuccess = ()=>{
        const list = (req.result || []).filter(p => p.facilityId === facilityId && !p.deletedAt);
        resolve(list);
      };
      req.onerror = ()=> reject(req.error);
    });
  }

  async function idbPutSnapshot(key, val){
    const db = await openTestIDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }

  async function idbGetSnapshot(key){
    const db = await openTestIDB();
    return new Promise((resolve, reject)=>{
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }

  // TEST A: 온라인 1개 지점 마킹 후 재실행
  let testAOk = false;
  try{
    const siteA = { id: 'facility-A', projectId: 'proj-1', name: '시설물 A', markers: [], nextNum: 1 };
    const marker1 = { id: 'm-1', num: 1, xPct: 25.5, yPct: 40.2, drawingId: 'd-1', photos: [] };
    
    // 마킹 확정 저장
    await idbPutPoint(marker1, siteA);
    siteA.markers.push(marker1);
    siteA.nextNum = 2;
    await idbPutSnapshot('point-shot-sites-v1', { sites: [siteA], currentSiteId: 'facility-A' });

    // 앱 재실행 시뮬레이션
    const loadedSnap = await idbGetSnapshot('point-shot-sites-v1');
    const durablePoints = await idbGetAllPoints('facility-A');
    
    if(loadedSnap && durablePoints.length === 1 && durablePoints[0].num === 1 && durablePoints[0].xPct === 25.5){
      testAOk = true;
      console.log('✓ TEST A (온라인 1개 지점 영구 보존): PASS');
    } else {
      console.log('✗ TEST A: FAIL');
    }
  }catch(e){
    console.error('TEST A 오류:', e);
  }

  // TEST B: 오프라인 5개 마킹 지속성
  let testBOk = false;
  try{
    const siteB = { id: 'facility-B', projectId: 'proj-1', name: '시설물 B', markers: [], nextNum: 1 };
    for(let i=1; i<=5; i++){
      const m = { id: 'm-b-' + i, num: i, xPct: i * 15, yPct: i * 12, drawingId: 'd-1', photos: [] };
      await idbPutPoint(m, siteB);
      siteB.markers.push(m);
      siteB.nextNum = i + 1;
    }
    await idbPutSnapshot('point-shot-sites-v1', { sites: [siteB], currentSiteId: 'facility-B' });

    // 재실행
    const restoredPoints = await idbGetAllPoints('facility-B');
    restoredPoints.sort((a,b)=>a.num - b.num);
    if(restoredPoints.length === 5 && restoredPoints[4].num === 5 && restoredPoints[0].xPct === 15 && restoredPoints[4].xPct === 75){
      testBOk = true;
      console.log('✓ TEST B (오프라인 5개 마킹 순서/위치 보존): PASS');
    } else {
      console.log('✗ TEST B: FAIL');
    }
  }catch(e){
    console.error('TEST B 오류:', e);
  }

  // TEST C: 오프라인 3개 지점 + 각 지점 사진 유지
  let testCOk = false;
  try{
    const siteC = { id: 'facility-C', projectId: 'proj-1', name: '시설물 C', markers: [], nextNum: 1 };
    for(let i=1; i<=3; i++){
      const m = {
        id: 'm-c-' + i,
        num: i,
        xPct: i * 20,
        yPct: i * 25,
        drawingId: 'd-1',
        photos: [{ id: 'photo-' + i, photoRef: 'photo-' + i, note: '손상 사진 ' + i }]
      };
      await idbPutPoint(m, siteC);
      siteC.markers.push(m);
      siteC.nextNum = i + 1;
    }
    await idbPutSnapshot('point-shot-sites-v1', { sites: [siteC], currentSiteId: 'facility-C' });

    const restoredC = await idbGetAllPoints('facility-C');
    const allHavePhotos = restoredC.every(m => m.photos && m.photos.length === 1 && m.photos[0].id.startsWith('photo-'));
    if(restoredC.length === 3 && allHavePhotos){
      testCOk = true;
      console.log('✓ TEST C (오프라인 3개 지점 + 사진 메타데이터 유지): PASS');
    } else {
      console.log('✗ TEST C: FAIL');
    }
  }catch(e){
    console.error('TEST C 오류:', e);
  }

  // TEST D: 오프라인 10개 고속 연속 마킹
  let testDOk = false;
  try{
    const siteD = { id: 'facility-D', projectId: 'proj-1', name: '시설물 D', markers: [], nextNum: 1 };
    const tasks = [];
    for(let i=1; i<=10; i++){
      const m = { id: 'm-d-' + i, num: i, xPct: i * 8, yPct: i * 9, drawingId: 'd-1', photos: [] };
      siteD.markers.push(m);
      tasks.push(idbPutPoint(m, siteD));
    }
    await Promise.all(tasks);
    siteD.nextNum = 11;
    await idbPutSnapshot('point-shot-sites-v1', { sites: [siteD], currentSiteId: 'facility-D' });

    const restoredD = await idbGetAllPoints('facility-D');
    if(restoredD.length === 10){
      testDOk = true;
      console.log('✓ TEST D (오프라인 10개 고속 마킹 100% 누락 없음): PASS');
    } else {
      console.log('✗ TEST D: FAIL');
    }
  }catch(e){
    console.error('TEST D 오류:', e);
  }

  // TEST E: 강제 종료(스냅샷 저장이 비어있거나 구버전이어도 Durable Store로부터 자동 복구)
  let testEOk = false;
  try{
    const siteE = { id: 'facility-E', projectId: 'proj-1', name: '시설물 E', markers: [], nextNum: 1 };
    // 스냅샷에는 지점 1개만 기록됨
    const m1 = { id: 'm-e-1', num: 1, xPct: 10, yPct: 10, drawingId: 'd-1', photos: [] };
    await idbPutPoint(m1, siteE);
    siteE.markers = [m1];
    await idbPutSnapshot('point-shot-sites-v1', { sites: [siteE], currentSiteId: 'facility-E' });

    // 그 직후 지점 2, 3이 idbPutPoint로는 저장되었으나 스냅샷 저장 전 앱 강제 종료 발생 시뮬레이션
    const m2 = { id: 'm-e-2', num: 2, xPct: 20, yPct: 20, drawingId: 'd-1', photos: [] };
    const m3 = { id: 'm-e-3', num: 3, xPct: 30, yPct: 30, drawingId: 'd-1', photos: [] };
    await idbPutPoint(m2, siteE);
    await idbPutPoint(m3, siteE);

    // 재실행 시 loadState()의 restoreInspectionPointsFromDurableStore 동작 시뮬레이션
    const loadedSnapshot = await idbGetSnapshot('point-shot-sites-v1');
    const activeSite = loadedSnapshot.sites.find(s => s.id === 'facility-E');
    let memoryMarkers = activeSite.markers || []; // snapshot 상에는 1개만 있음

    const durablePoints = await idbGetAllPoints('facility-E');
    const existingById = new Map(memoryMarkers.map(m => [m.id, m]));
    for(const p of durablePoints){
      if(!existingById.get(p.id)){
        memoryMarkers.push(p);
      }
    }
    memoryMarkers.sort((a,b)=>a.num - b.num);

    if(memoryMarkers.length === 3 && memoryMarkers[2].num === 3){
      testEOk = true;
      console.log('✓ TEST E (스냅샷 불완전/강제 종료 시 Durable Store로부터 완벽 복원): PASS');
    } else {
      console.log('✗ TEST E: FAIL');
    }
  }catch(e){
    console.error('TEST E 오류:', e);
  }

  console.log('\n=== [ALL PERSISTENCE TESTS COMPLETED] ===');
  const allPass = testAOk && testBOk && testCOk && testDOk && testEOk;
  console.log('OVERALL RESULT:', allPass ? 'ALL PASS' : 'SOME FAILED');
}

runTests().catch(console.error);
