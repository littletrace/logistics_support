import { useState, useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { UploadCloud, FileText, Download, Printer, RefreshCw, Database } from 'lucide-react';
import './App.css';

function formatExcelDate(val) {
  if (!val) return '';
  const str = String(val).trim();

  // YYYYMMDD 8자리 포맷 (예: 20260715)
  if (/^\d{8}$/.test(str)) {
    return `${str.substring(0, 4)}.${str.substring(4, 6)}.${str.substring(6, 8)}`;
  }

  // 엑셀 시리얼 날짜 (예: 46218)
  const num = Number(str);
  if (!isNaN(num) && num > 10000 && num < 100000) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    const yyyy = date.getUTCFullYear();
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd}`;
  }

  return str;
}

function formatPhoneNumber(val) {
  if (!val) return '';
  const str = String(val).replace(/[^0-9]/g, '');
  if (str.length === 11) {
    return `${str.substring(0, 3)}-${str.substring(3, 7)}-${str.substring(7)}`;
  } else if (str.length === 10) {
    if (str.startsWith('02')) {
      return `${str.substring(0, 2)}-${str.substring(2, 6)}-${str.substring(6)}`;
    } else {
      return `${str.substring(0, 3)}-${str.substring(3, 6)}-${str.substring(6)}`;
    }
  } else if (str.length === 9 && str.startsWith('02')) {
    return `${str.substring(0, 2)}-${str.substring(2, 5)}-${str.substring(5)}`;
  }
  return val;
}

function App() {
  const [orders, setOrders] = useState([]);
  const [isMappingLoaded, setIsMappingLoaded] = useState(false);
  const [mappingDict, setMappingDict] = useState({});
  const [cartonDict, setCartonDict] = useState({});
  const [loadingMsg, setLoadingMsg] = useState('데이터를 불러오는 중...');

  // 1. 마스터 데이터(품목관계) 구글 시트에서 가져오기
  useEffect(() => {
    async function fetchMasterData() {
      try {
        const response = await fetch('/api/gsheets');
        if (!response.ok) throw new Error('Network response was not ok');
        const arrayBuffer = await response.arrayBuffer();

        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        // '품목관계' 시트 파싱
        if (wb.SheetNames.includes('품목관계')) {
          const ws = wb.Sheets['품목관계'];
          const jsonData = XLSX.utils.sheet_to_json(ws);

          const dict = {};
          jsonData.forEach(row => {
            const linkCode = String(row['연결품목코드']).trim().toUpperCase();
            dict[linkCode] = {
              repCode: String(row['대표품목코드']).trim().toUpperCase(),
              repName: row['대표품목명'],
              repQty: Number(row['대표품목수량']) || 1
            };
          });
          setMappingDict(dict);

          // '품목리스트' 시트 파싱 (카톤 입수량)
          const listSheetName = wb.SheetNames.find(n => n.includes('품목리스트') || n.includes('품목(본사)'));
          if (listSheetName) {
            const wsList = wb.Sheets[listSheetName];
            const listData = XLSX.utils.sheet_to_json(wsList);
            const cDict = {};
            listData.forEach(row => {
              const ecode = String(row['품목코드'] || row['이카운트코드'] || '').trim().toUpperCase();
              const cSize = Number(row['카톤수량'] || row['카톤입수'] || 0);
              if (ecode && cSize > 0) {
                cDict[ecode] = cSize;
              }
            });
            setCartonDict(cDict);
          }

          setIsMappingLoaded(true);
          setLoadingMsg('');
        } else {
          setLoadingMsg('품목관계 시트를 찾을 수 없습니다.');
        }
      } catch (err) {
        console.error('Failed to fetch master data:', err);
        setLoadingMsg('마스터 데이터를 불러오는데 실패했습니다. 네트워크 상태를 확인하세요.');
      }
    }
    fetchMasterData();
  }, []);

  // 2. 업로드된 원본 파싱 및 변환 로직
  const onDrop = useCallback((acceptedFiles) => {
    if (!isMappingLoaded) {
      alert("마스터 데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const bstr = e.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rawData = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rawData.length <= 1) {
        alert("데이터가 없는 빈 파일입니다.");
        return;
      }

      // 헤더 추출 및 양식 유효성 검사
      const headers = rawData[0] || [];
      const headerStr = headers.join('').replace(/\s/g, '');
      
      if (!headerStr.includes('품목') || !headerStr.includes('판매No')) {
        alert("올바른 양식의 엑셀 파일이 아닙니다.\n이카운트 '물표미발행' 전용 양식을 다운로드하여 업로드해 주세요.");
        return;
      }

      // 데이터 행(Row)만 분리
      let rows = rawData.slice(1).filter(row => row && row.length > 0 && row[0]);

      // A:0(일자-No), B:1(번호), C:2(일자), D:3(품목코드), E:4(품목명), F:5(수량), H:7(특이사항)
      // I:8(카톤수량), J:9(수신자명), L:11(거래처명), M:12(연락처), N:13(우편번호)
      // O:14(주소), S:18(판매No.), U:20(거래처코드)

      // 번호(B열 - 인덱스 1) 기준으로 정렬
      rows.sort((a, b) => Number(a[1]) - Number(b[1]));

      const ordersMap = new Map();

      rows.forEach(row => {
        const orderNo = String(row[18] || '').trim();
        // 주문번호가 비어있거나, 헤더 행("판매No.")인 경우 무시
        if (!orderNo || orderNo === '판매No.') return;

        // 품목 매핑 변환 (연결품목) - 대소문자 구분 없이 처리하기 위해 대문자로 통일
        let originalItemCode = String(row[3] || '').trim().toUpperCase(); // D열: 이카운트코드 (K열 역할)
        let rawYlwCode = String(row[6] || '').trim().toUpperCase(); // G열: 영림원코드 (N열 역할)

        let transformedEcountCode = originalItemCode;
        let itemName = String(row[4] || '');
        let qty = Number(row[5]) || 0;

        // 연결품목 시트 로직: 원본 이카운트코드가 연결품목코드에 있으면 대표품목코드로 변환
        if (mappingDict[originalItemCode]) {
          const mapped = mappingDict[originalItemCode];
          transformedEcountCode = mapped.repCode;
          itemName = mapped.repName;
          qty = qty * mapped.repQty;
        }

        // 카톤 단위는 마스터데이터(품목리스트) 최우선 적용, 없으면 업로드 파일의 값(row[8]) 사용
        const cartonUnit = cartonDict[transformedEcountCode] || cartonDict[originalItemCode] || Number(row[8]) || 0;

        // 기존 주문 존재 확인
        if (!ordersMap.has(orderNo)) {
          let contact = String(row[12] || '').trim();
          if (contact && !contact.startsWith('0') && contact.length >= 9) contact = '0' + contact;

          ordersMap.set(orderNo, {
            orderNo: orderNo,
            date: formatExcelDate(row[2]),
            clientCode: String(row[20] || ''),
            clientName: String(row[11] || ''),
            recipient: String(row[9] || ''),
            contact: contact,
            zipCode: String(row[13] || ''),
            address: String(row[14] || ''),
            remarks: String(row[7] || ''),
            items: new Map() // 품목코드 기준 그룹핑용
          });
        }

        const order = ordersMap.get(orderNo);

        const groupKey = `${transformedEcountCode}_${rawYlwCode}`;

        if (!order.items.has(groupKey)) {
          order.items.set(groupKey, {
            ecountCode: transformedEcountCode,
            younglimwonCode: rawYlwCode,
            name: itemName,
            qty: 0,
            cartonUnit: cartonUnit
          });
        }

        const item = order.items.get(groupKey);
        item.qty += qty;
      });

      // Map 객체를 Array 형태로 정리 및 카톤/낱량 계산
      const processedOrders = Array.from(ordersMap.values()).map(order => {
        const itemList = Array.from(order.items.values()).map(it => {
          const c = it.cartonUnit > 0 ? Math.floor(it.qty / it.cartonUnit) : 0;
          const p = it.cartonUnit > 0 ? it.qty % it.cartonUnit : it.qty;
          return {
            ecountCode: it.ecountCode,
            younglimwonCode: it.younglimwonCode,
            name: it.name,
            qty: it.qty,
            carton: c,
            piece: p
          };
        });

        return {
          ...order,
          itemList
        };
      });

      setOrders(processedOrders);
    };
    reader.readAsBinaryString(file);
  }, [isMappingLoaded, mappingDict]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    }
  });

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // 송장발행 양식 생성
    // 9개 열: 수신자명, 우편번호, 주소, 연락처1, 연락처2, 판매No(주문번호), 거래처코드, 거래처명, 판매No(주문번호)
    const header = ['수신자명', '우편번호', '주소', '연락처1', '연락처2', '판매No(주문번호)', '거래처코드', '거래처명', '주문번호'];

    const exportData = orders.map(o => {
      const formattedContact = formatPhoneNumber(o.contact);
      return [
        o.recipient,
        o.zipCode,
        o.address,
        formattedContact,
        formattedContact, // 연락처2도 동일하게
        o.orderNo,
        o.clientCode,
        o.clientName,
        o.orderNo  // 주문번호 다시
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...exportData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '송장발행');
    XLSX.writeFile(wb, '송장발행_업로드용.xlsx');
  };

  const handleItemSummaryDownload = () => {
    const header = ['이카운트코드', '영림원코드', '주문번호', '거래처', '수취인', '품목명', '수량', '카톤', '잔량', '', '수량', '카톤', '잔량'];
    const exportData = combinedRows.map(r => [
      r.ecountCode,
      r.younglimwonCode,
      r.orderNo,
      r.clientName,
      r.recipient,
      r.itemName,
      r.qty,
      r.carton,
      r.piece,
      r.sumItemName,
      r.sumQty,
      r.sumCarton,
      r.sumPiece
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...exportData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '품목별수량');
    XLSX.writeFile(wb, '품목별수량.xlsx');
  };

  const itemSummary = useMemo(() => {
    const summary = new Map();
    orders.forEach(order => {
      order.itemList.forEach(item => {
        const key = `${item.ecountCode}_${item.younglimwonCode}`;
        if (!summary.has(key)) {
          summary.set(key, {
            ecountCode: item.ecountCode,
            younglimwonCode: item.younglimwonCode,
            name: item.name,
            qty: 0,
            carton: 0,
            piece: 0
          });
        }
        const s = summary.get(key);
        s.qty += item.qty;
        s.carton += item.carton;
        s.piece += item.piece;
      });
    });

    return Array.from(summary.values()).sort((a, b) => a.ecountCode.localeCompare(b.ecountCode));
  }, [orders]);

  const combinedRows = useMemo(() => {
    const allItems = [];
    orders.forEach(order => {
      order.itemList.forEach(item => {
        allItems.push({
          ecountCode: item.ecountCode || '',
          younglimwonCode: item.younglimwonCode || '',
          orderNo: order.orderNo,
          clientName: order.clientName,
          recipient: order.recipient,
          itemName: item.name,
          qty: item.qty,
          carton: item.carton,
          piece: item.piece
        });
      });
    });

    allItems.sort((a, b) => {
      if (a.ecountCode !== b.ecountCode) return a.ecountCode.localeCompare(b.ecountCode);
      if (a.younglimwonCode !== b.younglimwonCode) return a.younglimwonCode.localeCompare(b.younglimwonCode);
      return a.orderNo.localeCompare(b.orderNo);
    });

    const rows = [];
    let currentKey = null;

    allItems.forEach(item => {
      const key = `${item.ecountCode}_${item.younglimwonCode}`;
      if (key !== currentKey) {
        currentKey = key;
        const summary = itemSummary.find(s => s.ecountCode === item.ecountCode && s.younglimwonCode === item.younglimwonCode);
        rows.push({
          ...item,
          sumItemName: summary ? summary.name : '',
          sumQty: summary ? summary.qty : '',
          sumCarton: summary ? summary.carton : '',
          sumPiece: summary ? summary.piece : ''
        });
      } else {
        rows.push({
          ...item,
          sumItemName: '',
          sumQty: '',
          sumCarton: '',
          sumPiece: ''
        });
      }
    });

    return rows;
  }, [orders, itemSummary]);

  const resetData = () => {
    setOrders([]);
  };

  return (
    <div className="app-container">
      <header className="no-print">
        <h1>Logistics Hub</h1>
        <p>물표 자동생성 및 송장발행 시스템</p>
      </header>

      {orders.length === 0 ? (
        <div className="glass-panel no-print" style={{ position: 'relative', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
          {!isMappingLoaded && (
            <div style={{ position: 'absolute', top: '10px', right: '15px', display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontSize: '0.9rem' }}>
              <Database size={16} />
              <span>{loadingMsg}</span>
            </div>
          )}
          {isMappingLoaded && (
            <div style={{ position: 'absolute', top: '10px', right: '15px', display: 'flex', alignItems: 'center', gap: '6px', color: '#34d399', fontSize: '0.9rem' }}>
              <Database size={16} />
              <span>데이터 로딩 완료</span>
            </div>
          )}

          <div {...getRootProps()} className={`upload-zone ${isDragActive ? 'active' : ''}`} style={{ opacity: isMappingLoaded ? 1 : 0.5, pointerEvents: isMappingLoaded ? 'auto' : 'none' }}>
            <input {...getInputProps()} />
            <UploadCloud className="upload-icon" />
            <h2>{isDragActive ? '여기에 파일을 놓아주세요' : '물표미발행 엑셀 파일 업로드'}</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {isMappingLoaded ? '드래그 앤 드롭 또는 클릭하여 파일을 선택하세요 (.xlsx, .csv)' : '데이터 로딩 중...'}
            </p>
          </div>
        </div>
      ) : (
        <div className="dashboard-view">
          <div className="dashboard no-print">
            {/* 좌측: 요약 패널 */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="metric-card">
                <p style={{ color: 'var(--text-secondary)', margin: 0 }}>처리된 총 주문 건수</p>
                <div className="metric-value">{orders.length}</div>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>물표 인쇄 및 송장 발급이 준비되었습니다.</p>
              </div>
            </div>

            {/* 우측: 액션 패널 */}
            <div className="glass-panel action-buttons">
              <button className="btn" onClick={handlePrint}>
                <Printer size={20} />
                명세서 인쇄 (물표)
              </button>
              <button className="btn btn-secondary" onClick={handleDownload}>
                <Download size={20} />
                송장발행 엑셀 다운로드
              </button>
            </div>
          </div>

          <div className="reset-btn-container no-print">
            <button className="reset-btn" onClick={resetData}>
              <RefreshCw size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              새로운 파일 처리하기
            </button>
          </div>

          {/* 품목별 수량 요약 테이블 */}
          <div className="glass-panel no-print" style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>품목별 수량 집계</h3>
              <button className="btn btn-secondary" onClick={handleItemSummaryDownload} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', width: 'auto', display: 'flex', alignItems: 'center' }}>
                <Download size={16} style={{ marginRight: '6px' }} />
                품목별수량 엑셀 다운로드
              </button>
            </div>

            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 350px)', overflowY: 'auto' }}>
              <table style={{ width: 'calc(100% - 2rem)', margin: '0 auto', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#e2e8f0', borderBottom: '2px solid rgba(0,0,0,0.1)' }}>
                    {/*  <th style={{ padding: '10px' }}>이카운트코드</th>
                    <th style={{ padding: '10px' }}>영림원코드</th> */}
                    <th style={{ padding: '10px' }}>주문번호</th>
                    <th style={{ padding: '10px' }}>거래처</th>
                    <th style={{ padding: '10px' }}>수취인</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>품목명</th>
                    <th style={{ padding: '10px' }}>수량</th>
                    <th style={{ padding: '10px' }}>카톤</th>
                    <th style={{ padding: '10px' }}>잔량</th>
                    <th style={{ padding: '10px', background: '#f1f5f9' }}></th>
                    <th style={{ padding: '10px', background: '#f1f5f9' }}>수량</th>
                    <th style={{ padding: '10px', background: '#f1f5f9' }}>카톤</th>
                    <th style={{ padding: '10px', background: '#f1f5f9' }}>잔량</th>
                  </tr>
                </thead>
                <tbody>
                  {combinedRows.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: row.sumItemName ? 'rgba(59, 130, 246, 0.03)' : 'transparent' }}>
                      {/*  <td style={{ padding: '8px' }}>{row.ecountCode}</td>
                      <td style={{ padding: '8px' }}>{row.younglimwonCode}</td> */}
                      <td style={{ padding: '8px' }}>{row.orderNo}</td>
                      <td style={{ padding: '8px' }}>{row.clientName}</td>
                      <td style={{ padding: '8px' }}>{row.recipient}</td>
                      <td style={{ padding: '8px', textAlign: 'left' }}>{row.itemName}</td>
                      <td style={{ padding: '8px' }}>{row.qty}</td>
                      <td style={{ padding: '8px' }}>{row.carton}</td>
                      <td style={{ padding: '8px' }}>{row.piece}</td>
                      <td style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', background: '#f8fafc' }}>{row.sumItemName}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: 'var(--accent)', background: '#f8fafc' }}>{row.sumQty}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', background: '#f8fafc' }}>{row.sumCarton}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', background: '#f8fafc' }}>{row.sumPiece}</td>
                    </tr>
                  ))}
                  {combinedRows.length === 0 && (
                    <tr>
                      <td colSpan={13} style={{ padding: '20px', color: 'var(--text-secondary)' }}>집계된 품목이 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 인쇄용 뷰 (46행 구조 템플릿) */}
          <div className="print-view print-only" style={{ display: 'none', color: 'black' }}>
            {orders.map((order, idx) => {
              // 물표 품목은 고정 37행을 맞추어 그림
              const rows = Array(37).fill(null);
              order.itemList.forEach((item, i) => { if (i < 37) rows[i] = item; });

              return (
                <div key={order.orderNo} className="print-page" style={{ height: '297mm', width: '210mm', padding: '15mm', boxSizing: 'border-box' }}>
                  <div style={{ textAlign: 'left', fontSize: '15px', marginBottom: '10px' }}>
                    &lt;주문번호&gt;&nbsp;&nbsp;&nbsp;&nbsp;{order.orderNo}
                  </div>

                  <table style={{ width: 'calc(100% - 2rem)', margin: '0 auto 10px auto', borderCollapse: 'collapse', border: '2px solid black', fontSize: '14px', marginBottom: '15px' }}>
                    <tbody>
                      <tr>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', width: '15%', fontWeight: 'bold', textAlign: 'center' }}>거래처</th>
                        <td style={{ border: '1px solid black', padding: '4px', paddingLeft: '8px', width: '35%', textAlign: 'left' }}>{order.clientName}</td>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', width: '15%', fontWeight: 'bold', textAlign: 'center' }}>수령인</th>
                        <td style={{ border: '1px solid black', padding: '4px', width: '35%', textAlign: 'center' }}>{order.recipient}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', fontWeight: 'bold', textAlign: 'center' }}>연락처1</th>
                        <td style={{ border: '1px solid black', padding: '4px', paddingLeft: '8px', textAlign: 'left' }}>{order.contact}</td>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', fontWeight: 'bold', textAlign: 'center' }}>일자</th>
                        <td style={{ border: '1px solid black', padding: '4px', textAlign: 'center' }}>{order.date}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', fontWeight: 'bold', textAlign: 'center' }}>주소</th>
                        <td colSpan={3} style={{ border: '1px solid black', padding: '4px', paddingLeft: '8px', textAlign: 'left' }}>{order.address}</td>
                      </tr>
                      <tr>
                        <th style={{ border: '1px solid black', padding: '4px', background: '#d9d9d9', fontWeight: 'bold', textAlign: 'center' }}>특이사항</th>
                        <td colSpan={3} style={{ border: '1px solid black', padding: '4px', paddingLeft: '8px', textAlign: 'left' }}>{order.remarks}</td>
                      </tr>
                    </tbody>
                  </table>

                  <table style={{ width: 'calc(100% - 2rem)', margin: '0 auto', borderCollapse: 'collapse', border: '2px solid black', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#d9d9d9', height: '21px' }}>
                        <th style={{ border: '1px solid black', padding: '4px', width: '8%', fontWeight: 'bold', textAlign: 'center' }}>no</th>
                        <th style={{ border: '1px solid black', padding: '4px', width: '56%', fontWeight: 'bold', textAlign: 'center' }}>품목</th>
                        <th style={{ border: '1px solid black', padding: '4px', width: '12%', fontWeight: 'bold', textAlign: 'center' }}>수량</th>
                        <th style={{ border: '1px solid black', padding: '4px', width: '12%', fontWeight: 'bold', textAlign: 'center' }}>카톤</th>
                        <th style={{ border: '1px solid black', padding: '4px', width: '12%', fontWeight: 'bold', textAlign: 'center' }}>잔량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, i) => (
                        <tr key={i} style={{ height: '21px' }}>
                          <td style={{ border: '1px solid black', padding: '1px', textAlign: 'center' }}>{item ? i + 1 : '\u00A0'}</td>
                          <td style={{ border: '1px solid black', padding: '1px', paddingLeft: '8px', textAlign: 'left' }}>{item ? item.name : ''}</td>
                          <td style={{ border: '1px solid black', padding: '1px', textAlign: 'center' }}>{item ? item.qty : ''}</td>
                          <td style={{ border: '1px solid black', padding: '1px', textAlign: 'center' }}>{item ? item.carton : ''}</td>
                          <td style={{ border: '1px solid black', padding: '1px', textAlign: 'center' }}>{item ? item.piece : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
