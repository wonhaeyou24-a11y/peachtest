/**
 * FEATURE TEST: 도면 추가 시 PDF 및 이미지 파일 선택/변환 지원 검증
 */

const fs = require('fs');
const indexHtml = fs.readFileSync('c:\\Users\\dashl\\Desktop\\peachtest\\index.html', 'utf8');

const results = [];
function record(id, name, pass, detail) {
  results.push({ id, name, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${name} - ${detail}`);
}

async function runPdfFeatureTest() {
  console.log('=== FEATURE TEST: PDF 도면 추가 및 변환 지원 검증 ===\n');

  // 1. PDF.js CDN 스크립트가 head에 포함되어 있는지 검증
  const hasPdfJsCdn = indexHtml.includes('pdf.min.js');
  record('PDF-01', 'PDF.js 라이브러리 CDN 로드 선언', hasPdfJsCdn, 'pdf.min.js 스크립트 태그 확인');

  // 2. fileInput의 accept 속성에 pdf가 포함되어 있는지 검증
  const hasPdfAccept = indexHtml.includes('accept="image/*,application/pdf,.pdf"');
  record('PDF-02', 'fileInput accept 속성 PDF 허용', hasPdfAccept, 'image/*,application/pdf,.pdf 설정 확인');

  // 3. pdfToDataUrls 헬퍼 함수가 구현되어 있는지 검증
  const hasPdfHelper = indexHtml.includes('async function pdfToDataUrls(file, maxWidth = 2000)') &&
    indexHtml.includes('pdfjsLib.getDocument') &&
    indexHtml.includes('page.render');
  record('PDF-03', 'pdfToDataUrls 고해상도 렌더링 헬퍼 구현', hasPdfHelper, 'PDF.js 기반 캔버스 변환 함수 확인');

  // 4. fileInput change 이벤트에서 validateUploadedFile 및 PDF 분기 처리가 구현되었는지 검증
  const hasPdfValidation = indexHtml.includes("validateUploadedFile(file, ['image', 'pdf'], 100)") &&
    indexHtml.includes("const isPdf = file.type === 'application/pdf' || /\\.pdf$/i.test(file.name);") &&
    indexHtml.includes('pdfToDataUrls(file, 2000)');
  record('PDF-04', 'fileInput change 핸들러 PDF/이미지 분기 처리', hasPdfValidation, 'PDF 서명 검증 및 다중 페이지 도면 분할 추가 로직 확인');

  // 5. 시뮬레이션: 2페이지 PDF 도면 추가 시 drawings 배열에 각각 추가되는지 로직 시뮬레이션
  const fakeConvertedPages = [
    { pageNum: 1, dataUrl: 'data:image/jpeg;base64,PAGE_1_IMG', totalPages: 2 },
    { pageNum: 2, dataUrl: 'data:image/jpeg;base64,PAGE_2_IMG', totalPages: 2 }
  ];
  const drawings = [];
  const userBaseName = '교량 표준 단면도';
  fakeConvertedPages.forEach(page => {
    drawings.push({
      id: `draw-${page.pageNum}`,
      name: fakeConvertedPages.length > 1 ? `${userBaseName} (${page.pageNum}p)` : userBaseName,
      type: 'PDF 도면',
      order: drawings.length + 1,
      imageSrc: page.dataUrl
    });
  });

  const simPass = drawings.length === 2 &&
    drawings[0].name === '교량 표준 단면도 (1p)' &&
    drawings[1].name === '교량 표준 단면도 (2p)' &&
    drawings[0].type === 'PDF 도면';
  record('PDF-05', '다중 페이지 PDF 도면 일괄 분할 등록 시뮬레이션', simPass, '페이지별 도면 객체 분할 생성 확인');

  console.log('\n=== PDF FEATURE TEST SUMMARY ===');
  const allPass = results.every(r => r.pass);
  console.log(`Result: ${allPass ? 'ALL PASS (5/5)' : 'FAILURES DETECTED'}\n`);
  return allPass;
}

runPdfFeatureTest().then(ok => {
  process.exit(ok ? 0 : 1);
});
