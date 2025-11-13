/*
 shipping.js - enhanced
 - Supports Country + Method (Method from Excel 'Method' column)
 - File upload to replace rates on the fly (no redeploy)
 - Searchable country list
 - Displays quote directly on page (no export)
*/
const DEFAULT_RATE = 7.2; // CNY per USD

let rates = []; // array of entries {Country, Method, ...}
let lang = 'zh';
let currency = 'CNY';
let usdRate = DEFAULT_RATE;

const $ = id => document.getElementById(id);

function t(zh, en){ return lang === 'zh' ? zh : en; }

function setTexts(){
  $('label-country').textContent = t('目的地国家','Country');
  $('label-method').textContent = t('物流方式','Shipping Method');
  $('label-weight').textContent = t('重量','Weight');
  $('calcBtn').textContent = t('计算运费','Calculate');
  $('uploadLabel').textContent = t('上传费率表','Upload rates (.xlsx)');
  $('outText').textContent = t('请点击「计算运费」查看报价（页面直接显示）。','Click "Calculate" to see quote (shown on page).');
}

function parseNumber(v, fallback=0){ const n = Number(v); return isNaN(n) ? fallback : n; }

function loadRatesFromWorkbook(wb){
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const data = XLSX.utils.sheet_to_json(ws, {defval:""});
  rates = data.map(r => {
    return {
      Country: (r.Country || r.country || r.国家 || '').toString().trim(),
      Method: (r.Method || r.method || r.方式 || 'Default').toString().trim(),
      Start_weight: parseNumber(r.Start_weight || r['Start weight'] || r['开始重量'], 0),
      End_weight: parseNumber(r.End_weight || r['End weight'] || r['结束重量'], 30000),
      Base_weight: parseNumber(r.Base_weight || r['Base weight'] || r['首重'], 1),
      Base_fee: parseNumber(r.Base_fee || r['Base fee'] || r['首重费用'], 0),
      Add_unit_weight: parseNumber(r.Add_unit_weight || r['Add unit weight'] || r['续重单位重量'], 1),
      Add_unit_price: parseNumber(r.Add_unit_price || r['Add unit price'] || r['单价'], 0),
      Register_fee: parseNumber(r.Register_fee || r['Register fee'] || r['挂号费'], 0)
    };
  });
  populateCountryList();
}

async function loadRatesFromUrl(url='shipping-rates.xlsx'){
  try{
    const resp = await fetch(url);
    if(!resp.ok) throw new Error('Cannot fetch ' + url);
    const ab = await resp.arrayBuffer();
    const wb = XLSX.read(ab, {type:'array'});
    loadRatesFromWorkbook(wb);
  }catch(err){
    $('outText').textContent = 'Error loading rates: ' + err.message;
  }
}

function populateCountryList(){
  const sel = $('country');
  const countries = [...new Set(rates.map(r=>r.Country).filter(Boolean))].sort();
  sel.innerHTML = '';
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.text = c;
    sel.appendChild(opt);
  });
  populateMethodOptions();
}

function populateMethodOptions(){
  const country = $('country').value;
  const methodSel = $('method');
  methodSel.innerHTML = '';
  const methods = [...new Set(rates.filter(r=>r.Country===country).map(r=>r.Method))];
  if(methods.length === 0){
    const opt = document.createElement('option'); opt.value=''; opt.text = t('无可用方式','No methods'); methodSel.appendChild(opt);
  } else {
    methods.forEach(m=>{
      const opt = document.createElement('option'); opt.value = m; opt.text = m; methodSel.appendChild(opt);
    });
  }
}

function computeCost(entry, weight_g){
  let w = Math.max(0, weight_g);
  let extra = 0;
  if(w > entry.Base_weight){
    extra = ((w - entry.Base_weight) / entry.Add_unit_weight) * entry.Add_unit_price;
  }
  const total = entry.Base_fee + extra + entry.Register_fee;
  return {total, extra};
}

function formatMoneyCNY(v){ return '¥' + v.toFixed(2); }
function formatMoneyUSD(v){ return '$' + v.toFixed(2); }

document.addEventListener('DOMContentLoaded', async ()=>{
  // events
  $('lang').addEventListener('change', e=>{
    lang = e.target.value; setTexts();
  });
  $('currency').addEventListener('change', e=>{
    currency = e.target.value;
  });
  $('country').addEventListener('change', populateMethodOptions);
  $('countrySearch').addEventListener('input', ()=>{
    const q = $('countrySearch').value.trim().toLowerCase();
    const sel = $('country');
    for(let i=0;i<sel.options.length;i++){
      const opt = sel.options[i];
      opt.style.display = opt.text.toLowerCase().includes(q) ? '' : 'none';
    }
  });

  $('fileInput').addEventListener('change', e=>{
    const f = e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, {type:'array'});
      loadRatesFromWorkbook(wb);
      $('outText').textContent = t('已加载新的费率表并更新','Rates uploaded and updated');
    };
    reader.readAsArrayBuffer(f);
  });

  $('calcBtn').addEventListener('click', ()=>{
    const country = $('country').value;
    const method = $('method').value;
    let weight = Number($('weight').value) || 0;
    const unit = $('unit').value;
    if(unit === 'kg') weight = weight * 1000;
    const entry = rates.find(r=>r.Country===country && r.Method===method) || rates.find(r=>r.Country===country);
    if(!entry){
      $('outText').textContent = t('未找到该国家/方式的费率','Rates for selected country/method not found');
      return;
    }
    const {total, extra} = computeCost(entry, weight);
    const usd = total / usdRate;
    const details = [];
    details.push(t('国家','Country') + ': ' + entry.Country);
    details.push(t('方式','Method') + ': ' + (entry.Method || '-'));
    details.push(t('重量','Weight') + ': ' + weight + ' g');
    details.push(t('公式','Formula') + ': ' + entry.Base_fee + ' + (' + weight + ' - ' + entry.Base_weight + ') / ' + entry.Add_unit_weight + ' × ' + entry.Add_unit_price + ' + ' + entry.Register_fee);
    details.push(t('计算细节','Details') + ': ' + entry.Base_fee + ' + ' + extra.toFixed(2) + ' + ' + entry.Register_fee + ' = ' + total.toFixed(2) + ' CNY');
    if(currency === 'CNY'){
      details.push(t('结果','Result') + ': ' + formatMoneyCNY(total));
    } else {
      details.push(t('结果','Result') + ': ' + formatMoneyUSD(usd) + ' (≈ ' + formatMoneyCNY(total) + ')');
    }
    details.push('---');
    details.push('CNY: ' + formatMoneyCNY(total) + ' | USD: ' + formatMoneyUSD(usd));
    $('outText').innerHTML = details.map(d => '<div>' + d + '</div>').join('');
  });

  // initial text and load default rates file
  setTexts();
  $('rate').textContent = usdRate.toFixed(2);
  await loadRatesFromUrl();
});
