const XLSX = require('xlsx');

/**
 * Parse an uploaded Excel file and extract stock tickers with metadata.
 * Expected columns: Symbol, Name, Sector, Industry
 * Returns array of { ticker, name, sector, industry }.
 */
function parseExcelForTickers(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (data.length === 0) {
    throw new Error('Excel file is empty or has no data rows');
  }

  const headers = Object.keys(data[0]);

  // Find the symbol/ticker column
  function findCol(candidates) {
    for (const h of headers) {
      if (candidates.includes(h.toLowerCase().trim())) return h;
    }
    return null;
  }

  const symbolCol = findCol(['symbol', 'ticker', 'stock', 'symbols', 'tickers']) || headers[0];
  const nameCol = findCol(['name', 'company', 'stock name']);
  const sectorCol = findCol(['sector']);
  const industryCol = findCol(['industry', 'sub-industry', 'subindustry']);

  const seen = new Set();
  const stocks = [];

  for (const row of data) {
    const ticker = String(row[symbolCol]).trim().toUpperCase();
    if (!ticker || ticker.length > 10 || !/^[A-Z.]+$/.test(ticker) || seen.has(ticker)) {
      continue;
    }
    seen.add(ticker);
    stocks.push({
      ticker,
      name: nameCol ? String(row[nameCol]).trim() : '',
      sector: sectorCol ? String(row[sectorCol]).trim() : '',
      industry: industryCol ? String(row[industryCol]).trim() : '',
    });
  }

  if (stocks.length === 0) {
    throw new Error(
      `No valid tickers found in column "${symbolCol}". ` +
      `Available columns: ${headers.join(', ')}`
    );
  }

  return stocks;
}

module.exports = { parseExcelForTickers };
