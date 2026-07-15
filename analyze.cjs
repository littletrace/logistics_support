const XLSX = require('xlsx');
const fs = require('fs');

function analyzeFile(filename) {
    const filePath = `../${filename}`;
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    
    console.log(`\n\n=== Analysis of ${filename} ===`);
    const wb = XLSX.readFile(filePath, { cellFormula: true });
    
    wb.SheetNames.forEach(sheetName => {
        console.log(`\nSheet: ${sheetName}`);
        const ws = wb.Sheets[sheetName];
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        
        // Print first 50 rows or so
        for (let R = range.s.r; R <= Math.min(range.e.r, 50); ++R) {
            let rowStr = `Row ${R+1}: `;
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_address = {c:C, r:R};
                const cell_ref = XLSX.utils.encode_cell(cell_address);
                const cell = ws[cell_ref];
                if (!cell) continue;
                
                let val = cell.v !== undefined ? cell.v : '';
                let formula = cell.f ? `[Formula: ${cell.f}]` : '';
                if (val !== '' || formula !== '') {
                    rowStr += `${XLSX.utils.encode_col(C)}: ${val} ${formula} | `;
                }
            }
            if (rowStr !== `Row ${R+1}: `) {
                console.log(rowStr);
            }
        }
    });
}

analyzeFile('업로드엑셀양식.xlsx');
analyzeFile('원본변환.xlsx');
analyzeFile('물표.xlsx');
analyzeFile('송장발행.xlsx');
