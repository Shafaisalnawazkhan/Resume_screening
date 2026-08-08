const form=document.querySelector('#screenForm'),input=document.querySelector('#resume'),drop=document.querySelector('#dropZone'),label=document.querySelector('#fileLabel'),button=document.querySelector('#submitBtn'),error=document.querySelector('#errorMsg'),result=document.querySelector('#result'),preview=document.querySelector('#previewSection'),previewBody=document.querySelector('#previewBody'),previewName=document.querySelector('#previewName'),removeFile=document.querySelector('#removeFile');
let previewUrl='';
input.addEventListener('change',()=>showPreview(input.files[0]));
function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';previewBody.innerHTML='';preview.classList.add('hidden');input.value='';label.textContent='Drop your resume here'}
removeFile.addEventListener('click',clearPreview);
function showPreview(file){if(!file)return clearPreview();if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);label.textContent=file.name;previewName.textContent=file.name;preview.classList.remove('hidden');const ext=file.name.split('.').pop().toLowerCase(),size=(file.size/1024/1024).toFixed(2);if(file.type==='application/pdf'||ext==='pdf')previewBody.innerHTML=`<iframe src="${previewUrl}#toolbar=0&navpanes=0" title="Resume preview"></iframe>`;else if(file.type.startsWith('image/'))previewBody.innerHTML=`<img src="${previewUrl}" alt="Selected resume preview">`;else if(['txt','md'].includes(ext)){const reader=new FileReader();reader.onload=()=>previewBody.innerHTML=`<pre>${esc(String(reader.result).slice(0,12000))}</pre>`;reader.readAsText(file)}else previewBody.innerHTML=`<div class="document-placeholder"><div class="doc-icon">${ext.toUpperCase()}</div><div><b>${esc(file.name)}</b><p>${size} MB · Ready for secure analysis</p><small>Browser preview is unavailable for this format, but VeraCV will extract and analyze its content.</small></div></div>`}
['dragenter','dragover'].forEach(e=>drop.addEventListener(e,()=>drop.classList.add('drag')));
['dragleave','drop'].forEach(e=>drop.addEventListener(e,()=>drop.classList.remove('drag')));
const esc=value=>{const d=document.createElement('div');d.textContent=value;return d.innerHTML};
const chips=(items,kind='good')=>items.length?items.map(x=>`<span class="report-chip ${kind}">${esc(x)}</span>`).join(''):'<span class="text-sm text-[#758077]">None detected</span>';
const list=items=>items.map(x=>`<li><span>✓</span><p>${esc(x)}</p></li>`).join('');

const ocrStatus=document.querySelector('#ocrStatus');
async function browserOcr(file){
  if(!window.Tesseract)throw new Error('Browser OCR could not load. Check your internet connection and try again.');
  const recognize=async source=>{const out=await Tesseract.recognize(source,'eng',{logger:m=>{if(m.status==='recognizing text')ocrStatus.textContent=`Reading scanned resume… ${Math.round((m.progress||0)*100)}%`}});return out.data.text||''};
  if(file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf')){
    if(!window.pdfjsLib)throw new Error('PDF reader could not load. Refresh the page and try again.');
    pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,text=[];
    for(let n=1;n<=pdf.numPages;n++){ocrStatus.textContent=`Preparing page ${n} of ${pdf.numPages}…`;const page=await pdf.getPage(n),viewport=page.getViewport({scale:2}),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.width=viewport.width;canvas.height=viewport.height;await page.render({canvasContext:ctx,viewport}).promise;text.push(await recognize(canvas))}
    return text.join('\n');
  }
  return recognize(file);
}

form.addEventListener('submit',async e=>{
  e.preventDefault();error.classList.add('hidden');result.classList.add('hidden');button.disabled=true;button.innerHTML='Building your full report… <span class="ml-2 inline-block animate-spin">◌</span>';
  try{
    let payload=new FormData(form),response=await fetch('/api/screen',{method:'POST',body:payload}),type=response.headers.get('content-type')||'';
    if(!type.includes('application/json')){console.error(await response.text());throw new Error(`Server error (${response.status}). Restart Flask and try again.`)}
    let data=await response.json();
    if(!response.ok&&data.code==='ocr_required'){
      ocrStatus.classList.remove('hidden');ocrStatus.textContent='Starting secure browser OCR…';
      const extracted=await browserOcr(input.files[0]);
      if(extracted.trim().length<30)throw new Error('OCR could not find enough readable text. Try a clearer scan or the original DOCX.');
      payload=new FormData(form);payload.append('extracted_text',extracted);ocrStatus.textContent='OCR complete. Building your report…';
      response=await fetch('/api/screen',{method:'POST',body:payload});data=await response.json();
    }
    if(!response.ok)throw new Error(data.error||'Analysis failed.');
    const recs=data.recommendations.map((r,i)=>`<article class="recommendation"><div class="rec-number">${String(i+1).padStart(2,'0')}</div><div><div class="flex flex-wrap items-center gap-2"><h5>${esc(r.title)}</h5><span class="priority ${r.priority.toLowerCase()}">${r.priority} priority</span></div><p>${esc(r.detail)}</p></div></article>`).join('');
    result.innerHTML=`
      <div class="report-head"><div><span class="eyebrow dark">Complete resume review</span><h3>Your path to a stronger application.</h3><p>${esc(data.summary)}</p></div><button type="button" onclick="printReport()" class="print-btn">Print report ↗</button></div>
      <div class="score-grid">
        <article class="score-card"><div class="score-ring"><span>${data.score}</span><small>/100</small></div><div><small>Job match</small><h4>${esc(data.verdict)}</h4><p>Role-specific alignment based on the description.</p></div></article>
        <article class="score-card"><div class="score-ring ats-ring" style="--ats:${data.ats.score*3.6}deg"><span>${data.ats.score}</span><small>/100</small></div><div><small>ATS compatibility</small><h4>${esc(data.ats.label)}</h4><p>${data.ats.word_count} words · ${data.ats.bullets} bullets · ${data.ats.metrics} measured results</p></div></article>
      </div>
      <div class="report-grid">
        <section class="report-box"><div class="box-title"><span>01</span><h4>Job-description alignment</h4></div><p class="box-copy">Keywords already supported by your resume and important requirements to add only where they truthfully reflect your experience.</p><h6>Matched signals</h6><div class="chip-row">${chips(data.matched)}</div><h6>Missing or underused</h6><div class="chip-row">${chips(data.missing,'gap')}</div></section>
        <section class="report-box"><div class="box-title"><span>02</span><h4>ATS health check</h4></div><div class="ats-bars"><div><label>Contact details <b>${data.ats.contact}/20</b></label><i><em style="width:${data.ats.contact/20*100}%"></em></i></div><div><label>Standard sections <b>${data.ats.sections}/30</b></label><i><em style="width:${data.ats.sections/30*100}%"></em></i></div><div><label>Resume length <b>${data.ats.word_count} words</b></label><i><em style="width:${Math.min(100,data.ats.word_count/5)}%"></em></i></div><div><label>Evidence & metrics <b>${data.ats.metrics} found</b></label><i><em style="width:${Math.min(100,data.ats.metrics/3*100)}%"></em></i></div></div><h6>Recognized sections</h6><div class="chip-row">${chips(data.sections.found)}</div></section>
      </div>
      <section class="report-box full"><div class="box-title"><span>03</span><h4>What already creates a strong impression</h4></div><ul class="insight-list">${list(data.strengths)}</ul></section>
      <section class="report-box full"><div class="box-title"><span>04</span><h4>What to change before applying</h4></div><div class="recommendations">${recs}</div></section>
      <section class="report-box full impression"><div class="box-title"><span>05</span><h4>Strong-impression checklist</h4></div><ul class="insight-list cols">${list(data.impression)}</ul><div class="formula"><span>Winning bullet formula</span><strong>Action + task + technology + measurable result</strong><p>Example: “Automated CI/CD pipelines with GitHub Actions, reducing deployment time by 45%.”</p></div></section>
      <p class="report-note">This report is guidance, not a hiring decision. Add keywords only when they accurately represent your experience.</p>`;
    result.classList.remove('hidden');result.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(err){error.textContent=err.message;error.classList.remove('hidden')}
  finally{button.disabled=false;button.innerHTML='Analyze candidate <span class="ml-2">→</span>';ocrStatus.classList.add('hidden')}
});

function printReport(){
  if(result.classList.contains('hidden'))return;
  const printable=result.cloneNode(true),printButton=printable.querySelector('.print-btn');
  if(printButton)printButton.remove();
  const fileName=input.files[0]?.name||'Resume';
  const date=new Intl.DateTimeFormat('en',{dateStyle:'long'}).format(new Date());
  const popup=window.open('','_blank','width=1100,height=800');
  if(!popup){error.textContent='Please allow pop-ups to print the report.';error.classList.remove('hidden');return}
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VeraCV report — ${esc(fileName)}</title><style>
  @page{size:auto;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#17291e;background:white;font-family:Arial,sans-serif;font-size:10pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}.print-shell{max-width:1180px;margin:auto}.print-brand{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2px solid #163d26;margin-bottom:20px}.print-logo{font-size:21px;font-weight:800;letter-spacing:-1px}.print-logo span{color:#64936d}.print-meta{text-align:right;color:#66756b;font-size:8pt}.result-panel{display:block!important}.report-head h3{font-size:25pt;margin:6px 0}.report-head p{color:#5d6b62;margin:0}.eyebrow{font-size:7pt;letter-spacing:1.5px;color:#4d7357}.score-grid,.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.score-card,.report-box{border:1px solid #dce5dc;border-radius:12px;background:#fff;padding:15px;break-inside:avoid;page-break-inside:avoid}.score-card{display:flex;align-items:center;gap:13px}.score-ring{position:relative;display:grid;place-items:center;flex:none;width:60px;height:60px;border-radius:50%;background:#eaf2e8;border:5px solid #598b64}.score-ring span{font-size:17pt;font-weight:700}.score-ring small{font-size:7pt}.score-card h4{margin:2px 0;font-size:13pt}.score-card p,.box-copy,.recommendation p{color:#637168;font-size:8.5pt;line-height:1.45}.report-box.full{margin-top:10px}.box-title{display:flex;align-items:center;gap:8px}.box-title>span{display:grid;place-items:center;width:25px;height:25px;border-radius:7px;background:#eaf2e8;font-size:7pt}.box-title h4{font-size:12pt;margin:0}.report-box h6{font-size:7pt;margin:12px 0 6px;color:#6d7b72}.chip-row{display:flex;gap:5px;flex-wrap:wrap}.report-chip,.priority{padding:4px 7px;border-radius:20px;background:#edf4ea;font-size:7.5pt}.report-chip.gap{background:#fff2ea;border:1px solid #ead7cd}.ats-bars{display:grid;gap:7px}.ats-bars label{display:flex;justify-content:space-between;font-size:8pt}.ats-bars i{display:block;height:4px;background:#e7ece6}.ats-bars em{display:block;height:100%;background:#548162}.insight-list{display:grid;gap:6px;padding:0;list-style:none}.insight-list.cols{grid-template-columns:1fr 1fr}.insight-list li{display:flex;gap:7px;font-size:8.5pt}.recommendation{display:grid;grid-template-columns:28px 1fr;gap:8px;padding:9px 0;border-top:1px solid #e8ede8;break-inside:avoid}.recommendation h5{margin:0;font-size:9.5pt}.recommendation p{margin:4px 0}.formula{padding:12px;background:#163d26!important;color:white;border-radius:9px}.formula strong{display:block;margin:5px 0}.formula p{margin:0;color:#d5e1d7}.report-note{text-align:center;color:#77847c;font-size:7pt;margin-top:12px}
  @media print and (orientation:portrait){.report-grid{grid-template-columns:1fr}.report-head h3{font-size:22pt}.report-box{padding:13px}}
  @media print and (orientation:landscape){.print-shell{max-width:none}.report-grid{grid-template-columns:1fr 1fr}.report-box.full.impression .insight-list{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:700px){.score-grid,.report-grid,.insight-list.cols{grid-template-columns:1fr}.print-brand{align-items:flex-start}.report-head h3{font-size:20pt}}
  </style></head><body><main class="print-shell"><header class="print-brand"><div class="print-logo">vera<span>cv</span></div><div class="print-meta"><b>Resume Intelligence Report</b><br>${esc(fileName)} · ${date}</div></header>${printable.innerHTML}</main><script>window.onload=()=>setTimeout(()=>window.print(),250);window.onafterprint=()=>window.close();<\/script></body></html>`);
  popup.document.close();
}
