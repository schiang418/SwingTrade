/**
 * Gemini AI module for multimodal stock analysis.
 * Analyzes CSV scan data + CandleGlance chart images using Google's Gemini API.
 */

const fs = require('fs');
const path = require('path');

// System prompt for Gemini analysis
const SYSTEM_PROMPT = `Role: You are the Quantitative Analysis Engine for a high-performance stock swing trading platform. Your goal is to provide structured, machine-readable technical analysis of stock charts and CSV data.

I. Technical Analysis Core Logic
Multimodal Mapping: Match each symbol from the CSV to its visual chart in the uploaded image.

20-EMA Strategy: Identify "Mean Reversion" setups where price pulls back to a rising 20-day EMA. Look for bullish confirmation (long lower wicks, hammers, or green engulfing candles) at the touchpoint.

Ranking (1-5 Stars): Assign a star rating based on the quality of the setup and trend strength.

II. Categorization Buckets
bucket_1 (High Conviction): Price is successfully testing a rising 20-EMA with confirmed support.

bucket_2 (Watchlist): Price is near the 20-EMA but lacks clear reversal signals.

bucket_3 (Under Observation): Price has broken below the 20-EMA or the trend has flattened.

CRITICAL REQUIREMENT: For each stock in the stock_analysis array, the "analysis" field MUST explicitly state WHY the stock was placed in its specific category. The reasoning must reference specific technical indicators visible in the chart.

COMPANY DESCRIPTION REQUIREMENT: For each stock, include a "company_description" field with 1-2 concise sentences describing what the company does.

III. Formatting Constraints
JSON Only: Output MUST be a single, valid JSON object. No markdown backticks or prose.

Merged Setup Narrative: The swing_setup field must be a single descriptive paragraph including Entry Zone, Stop-Loss, Target Price, and Risk/Reward Ratio.

Summary Table: Include all three buckets (High Conviction, Watchlist, Under Observation) in the categorization_summary array.

IV. Example Output (Mandatory Schema)
{
  "categorization_summary": [
    {
      "bucket_name": "High Conviction",
      "strategy": "Aggressive Mean Reversion: Buy at 20-EMA touch with confirmed reversal.",
      "symbols": ["UEC"]
    },
    {
      "bucket_name": "Watchlist",
      "strategy": "Conditional Entry: Wait for green reversal candle confirmation at 20-EMA.",
      "symbols": ["JMIA"]
    },
    {
      "bucket_name": "Under Observation",
      "strategy": "Capital Preservation: No trade until price reclaims 20-EMA.",
      "symbols": ["HBM"]
    }
  ],
  "stock_analysis": [
    {
      "symbol": "UEC",
      "company_name": "Uranium Energy Corp",
      "company_description": "Uranium Energy Corp is a uranium mining and exploration company.",
      "star_rating": 5,
      "ranking_formatted": "★★★★★ (Top Pick)",
      "bucket": "bucket_1",
      "analysis": "Placed in High Conviction because UEC is successfully testing a rising 20-EMA at $16.26 with a bullish hammer candle showing strong support.",
      "swing_setup": "Establish a long position in the $16.50-$17.00 entry zone. Set target at $20.50 and stop-loss at $15.85. Risk/Reward: 1:3.5."
    }
  ]
}`;

/**
 * Invoke Gemini API with multimodal input (text + images)
 */
async function invokeGemini({ systemPrompt, userPrompt, images = [], temperature = 0.7, responseFormat = 'application/json' }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured in environment');
  }

  const model = 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Build user message parts
  const userParts = [];

  if (userPrompt) {
    userParts.push({ text: userPrompt });
  }

  for (const image of images) {
    userParts.push({
      inline_data: {
        mime_type: image.mimeType,
        data: image.data,
      },
    });
  }

  const request = {
    contents: [{ role: 'user', parts: userParts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 12000,
      responseMimeType: responseFormat === 'application/json' ? 'application/json' : 'text/plain',
    },
  };

  console.log(`[Gemini] Sending request: model=${model}, images=${images.length}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Gemini] API error:', errorText);
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('Gemini API returned no candidates');
  }

  const candidate = data.candidates[0];
  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new Error('Gemini API returned empty content');
  }

  const textContent = candidate.content.parts[0].text;
  console.log(`[Gemini] Response: ${textContent.length} chars, finish: ${candidate.finishReason}`);

  return textContent;
}

/**
 * Analyze scan results using Gemini AI
 *
 * @param {string} csvPath - Path to the CSV file
 * @param {string} imagePath - Path to the CandleGlance screenshot
 * @param {string} listName - Name of the list (e.g., "leading_stocks")
 * @returns {Object} Analysis results with categorization and per-stock analysis
 */
async function analyzeScanResults(csvPath, imagePath, listName) {
  console.log(`[AI Analysis] Starting for ${listName}: csv=${csvPath}, image=${imagePath}`);

  if (!csvPath || !imagePath) {
    throw new Error('Missing CSV or image path');
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`);
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file not found: ${imagePath}`);
  }

  // Read CSV
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  // Read image and convert to base64
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const userPrompt = `Analyze the following stock scan results for the ${listName} chartlist. The CSV contains stock symbols and data, and the image shows the CandleGlance charts for these stocks.

CSV Data:
${csvContent}

Please analyze each stock according to the 20-EMA strategy and provide structured JSON output following the mandatory schema.`;

  // Call Gemini with retry logic
  let responseText = '';
  let analysisOutput = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AI Analysis] Attempt ${attempt}/${maxRetries}`);
      responseText = await invokeGemini({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
        images: [{ mimeType, data: imageBase64 }],
        temperature: 0.7,
        responseFormat: 'application/json',
      });

      analysisOutput = JSON.parse(responseText);

      if (!analysisOutput || !analysisOutput.categorization_summary || !analysisOutput.stock_analysis) {
        throw new Error('Gemini response missing required fields');
      }

      console.log(`[AI Analysis] Success on attempt ${attempt}: ${analysisOutput.stock_analysis.length} stocks`);
      break;
    } catch (error) {
      console.error(`[AI Analysis] Attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw new Error(`Gemini analysis failed after ${maxRetries} attempts: ${error.message}`);
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }

  return analysisOutput;
}

module.exports = {
  invokeGemini,
  analyzeScanResults,
  SYSTEM_PROMPT,
};
