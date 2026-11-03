const localDate = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateLabel = (date, time) => date === localDate() ? `Hoy, ${time}` : date === localDate(-1) ? `Ayer, ${time}` : `${date.split('-').reverse().join('/')}, ${time}`;
const landingNames = ['La Terreta Asistencia', 'Formentor Reparaciones', 'Confort Clima Madrid', 'TecniLlar Barcelona'];
const deviceNames = ['Aire acondicionado', 'Lavadora', 'Lavavajillas', 'Secadora', 'Termo eléctrico', 'Caldera'];
const categoryNames = ['Gama blanca', 'Clima'];
let notices = [
  {name:'Cliente de prueba 01',phone:'600 111 201',device:'Aire acondicionado',landing:landingNames[0],date:localDate(),time:dateLabel(localDate(),'09:42'),status:'Nuevo'},
  {name:'Cliente de prueba 02',phone:'600 111 202',device:'Lavadora',landing:landingNames[2],date:localDate(),time:dateLabel(localDate(),'09:18'),status:'Sale'},
  {name:'Cliente de prueba 03',phone:'600 111 203',device:'Termo eléctrico',landing:landingNames[1],date:localDate(),time:dateLabel(localDate(),'08:56'),status:'No sale'},
  {name:'Cliente de prueba 04',phone:'600 111 204',device:'Lavavajillas',landing:landingNames[3],date:localDate(-1),time:dateLabel(localDate(-1),'18:33'),status:'Sale'},
  {name:'Cliente de prueba 05',phone:'600 111 205',device:'Secadora',landing:landingNames[0],date:localDate(-1),time:dateLabel(localDate(-1),'17:05'),status:'Nuevo'},
  {name:'Cliente de prueba 06',phone:'600 111 206',device:'Aire acondicionado',landing:landingNames[1],date:localDate(-1),time:dateLabel(localDate(-1),'16:41'),status:'No sale'}
];
let priceRules = [
  {landing:landingNames[0],category:'Clima',price:90},
  {landing:landingNames[0],category:'Gama blanca',price:75},
  {landing:landingNames[1],category:'Clima',price:100},
  {landing:landingNames[1],category:'Gama blanca',price:85},
  {landing:landingNames[2],category:'Clima',price:120},
  {landing:landingNames[2],category:'Gama blanca',price:75},
  {landing:landingNames[3],category:'Clima',price:95},
  {landing:landingNames[3],category:'Gama blanca',price:80}
];
let fields = [
  {name:'Nombre y apellidos',type:'Texto',code:'name',enabled:true,custom:false},
  {name:'Teléfono',type:'Teléfono',code:'phone',enabled:true,custom:false},
  {name:'Localidad',type:'Texto',code:'locality',enabled:true,custom:false},
  {name:'Código postal',type:'Texto',code:'postal',enabled:true,custom:false},
  {name:'Aparato',type:'Lista',code:'device',enabled:true,custom:false},
  {name:'Marca del aparato',type:'Texto',code:'brand',enabled:true,custom:false},
  {name:'Avería',type:'Texto',code:'issue',enabled:true,custom:false}
];
try {
  const saved = JSON.parse(localStorage.getItem('crm-st-demo-config') || '{}');
  if (Array.isArray(saved.priceRules)) {
    if (saved.priceRules.every(rule => rule.category)) priceRules = saved.priceRules;
    else {
      const migrated=new Map();
      saved.priceRules.forEach(rule=>{const category=rule.category||deviceCategory(rule.device||'');if(category)migrated.set(`${rule.landing}|${category}`,Number(rule.price)||0);});
      priceRules=priceRules.map(rule=>({...rule,price:migrated.get(`${rule.landing}|${rule.category}`)??rule.price}));
    }
  }
  if (Array.isArray(saved.fields)) fields = saved.fields;
} catch {}
const persistConfig = () => localStorage.setItem('crm-st-demo-config', JSON.stringify({priceRules, fields}));
const escapeHtml = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const tbody = document.getElementById('noticeRows');

function statusClass(s) { return s === 'Sale' ? 'sold' : s === 'No sale' ? 'lost' : s === 'Nuevo' ? 'new' : 'pending'; }
function getPrice(landing, device) {
  const category = deviceCategory(device);
  const rule = priceRules.find(r => r.landing === landing && r.category === category);
  return rule ? `${Number(rule.price).toLocaleString('es-ES')} €` : '—';
}
function deviceCategory(device) {
  const value=String(device).toLocaleLowerCase('es-ES');
  if(['aire acondicionado','aerotermia','bomba de calor','acs','caldera','calentador de gas','termo eléctrico'].some(item=>value.includes(item))) return 'Clima';
  if(value==='otro') return null;
  return 'Gama blanca';
}
function inDatePeriod(date, period, exact, from, to) {
  const today = localDate();
  if (period === 'today') return date === today;
  if (period === 'yesterday') return date === localDate(-1);
  if (period === 'date') return !exact || date === exact;
  if (period === 'range') return (!from || date >= from) && (!to || date <= to);
  if (period === 'week') {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - (d.getDay() + 6) % 7);
    const monday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return date >= monday && date <= today;
  }
  if (period === 'month') return date.slice(0, 7) === today.slice(0, 7);
  return date >= localDate(-29) && date <= today;
}
function renderRows() {
  const q = (document.getElementById('tableSearch').value || document.getElementById('globalSearch').value).toLowerCase();
  const st = document.getElementById('statusFilter').value;
  const land = document.getElementById('landingFilter').value;
  const weekday = document.getElementById('weekdayFilter').value;
  const period = document.getElementById('period').value;
  const exact = document.getElementById('exactDate').value;
  const from = document.getElementById('dateFrom').value;
  const to = document.getElementById('dateTo').value;
  const rows = notices.filter(n => {
    const day = new Date(`${n.date}T12:00:00`).getDay();
    return (!q || `${n.name} ${n.phone} ${n.device} ${n.landing}`.toLowerCase().includes(q)) &&
      (st === 'all' || n.status === st) && (land === 'all' || n.landing === land) &&
      (weekday === 'all' || day === Number(weekday)) && inDatePeriod(n.date, period, exact, from, to);
  });
  tbody.innerHTML = rows.map(n => `<tr><td><div class="client-cell"><span class="client-initial">${escapeHtml(n.name.slice(-2))}</span><div><strong>${escapeHtml(n.name)}</strong><small>${escapeHtml(n.phone)}</small></div></div></td><td><span class="device">${escapeHtml(n.device)}</span></td><td><span class="source">${escapeHtml(n.landing)}</span></td><td>${escapeHtml(n.time)}</td><td><select class="status ${statusClass(n.status)}" data-index="${notices.indexOf(n)}" aria-label="Cambiar estado" style="border:0;appearance:none;padding-right:9px"><option ${n.status==='Nuevo'?'selected':''}>Nuevo</option><option ${n.status==='Sale'?'selected':''}>Sale</option><option ${n.status==='No sale'?'selected':''}>No sale</option></select></td><td>${getPrice(n.landing,n.device)}</td><td><button class="row-action" aria-label="Abrir aviso" data-open="${notices.indexOf(n)}">···</button></td></tr>`).join('');
  document.getElementById('emptyState').hidden = rows.length > 0;
  document.getElementById('rowCount').textContent = `Mostrando ${rows.length} de ${notices.length} avisos de ejemplo`;
  const fresh=rows.filter(n=>n.status==='Nuevo').length, sold=rows.filter(n=>n.status==='Sale').length, lost=rows.filter(n=>n.status==='No sale').length;
  const managed=sold+lost, total=rows.length;
  document.getElementById('mTotal').textContent=total;
  document.getElementById('mNew').textContent=fresh;
  document.getElementById('mSold').textContent=sold;
  document.getElementById('mLost').textContent=lost;
  document.getElementById('mConversion').textContent=`${managed?Math.round(sold/managed*100):0} %`;
  document.getElementById('mLostPercent').textContent=`${total?Math.round(lost/total*100):0} % de avisos recibidos`;
  document.getElementById('donutTotal').textContent=total;
  document.getElementById('donutSold').textContent=sold;
  document.getElementById('donutLost').textContent=lost;
  document.getElementById('donutNew').textContent=fresh;
  const denominator=total||1, soldPct=sold/denominator*100, lostPct=lost/denominator*100;
  document.querySelector('.donut').style.background=`conic-gradient(#5c70ed 0 ${soldPct}%,#efbb65 ${soldPct}% ${soldPct+lostPct}%,#dfe3eb ${soldPct+lostPct}% 100%)`;
  const dayOrder=[1,2,3,4,5,6,0];
  const daily=dayOrder.map(day=>{const group=rows.filter(n=>new Date(`${n.date}T12:00:00`).getDay()===day);return [group.length,group.filter(n=>n.status==='Sale').length,group.filter(n=>n.status==='No sale').length];});
  const maxDaily=Math.max(1,...daily.flat());
  document.querySelectorAll('.bar-group').forEach((group,index)=>group.querySelectorAll('.bar-stack .bar').forEach((bar,barIndex)=>{bar.style.height=`${daily[index][barIndex]/maxDaily*100}%`;}));
  tbody.querySelectorAll('select').forEach(sel => sel.addEventListener('change', e => {
    notices[+e.target.dataset.index].status = e.target.value;
    e.target.className = 'status ' + statusClass(e.target.value);
    renderRows();
  }));
  tbody.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openDetails(+b.dataset.open)));
}
function setupDateControls(prefix) {
  const report = prefix === 'report';
  const select = document.getElementById(report ? 'reportPeriod' : 'period');
  const exactBox = document.getElementById(report ? 'reportExactDateControl' : 'exactDateControl');
  const rangeBox = document.getElementById(report ? 'reportRangeControls' : 'rangeDateControls');
  select.addEventListener('change', () => {
    exactBox.hidden = select.value !== 'date';
    rangeBox.hidden = select.value !== 'range';
    if (report) renderReport(); else renderRows();
  });
  if (!report) ['exactDate','dateFrom','dateTo'].forEach(id => document.getElementById(id).addEventListener('change', renderRows));
  else ['reportExactDate','reportDateFrom','reportDateTo'].forEach(id => document.getElementById(id).addEventListener('change', renderReport));
}
setupDateControls('main');
setupDateControls('report');
['tableSearch','globalSearch'].forEach(id => document.getElementById(id).addEventListener('input', renderRows));
['statusFilter','landingFilter','weekdayFilter'].forEach(id => document.getElementById(id).addEventListener('change', renderRows));

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
  document.querySelectorAll('.nav button[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === name));
  const labels = {avisos:'Avisos',informes:'Informes',empresas:'Empresas',usuarios:'Usuarios y permisos',configuracion:'Configuración',integraciones:'Integraciones'};
  document.getElementById('breadcrumb').textContent = `Panel / ${labels[name]}`;
  document.getElementById('sidebar').classList.remove('open');
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.nav button[data-page]').forEach(b => b.addEventListener('click', () => showPage(b.dataset.page)));
const modal = document.getElementById('modal');
function openModal() { renderExtraFields(); modal.classList.add('open'); document.getElementById('fName').focus(); }
function closeModal() { modal.classList.remove('open'); }
document.getElementById('newNotice').addEventListener('click', openModal);
document.getElementById('closeModal').addEventListener('click', closeModal);
document.getElementById('cancelModal').addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
function showToast(message = 'Landing: La Terreta Asistencia · Aire acondicionado') {
  const t = document.getElementById('toast'); t.querySelector('p').textContent = message; t.classList.add('show');
  clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => t.classList.remove('show'), 5200);
}
document.getElementById('showToast').addEventListener('click', () => showToast());
document.getElementById('noticeForm').addEventListener('submit', e => {
  e.preventDefault();
  const now = new Date(), clock = now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  const landing = document.getElementById('fLanding').value, device = document.getElementById('fDevice').value;
  notices.unshift({name:document.getElementById('fName').value,phone:document.getElementById('fPhone').value,device,landing,date:localDate(),time:`Hoy, ${clock}`,status:'Nuevo'});
  closeModal(); e.target.reset(); renderRows();
  showToast(`Landing: ${landing} · ${device}`);
});
function openDetails(i) { const n = notices[i]; alert(`${n.name}\n${n.phone}\n${n.device}\nOrigen: ${n.landing}\nEstado: ${n.status}\nRecibido: ${n.time}`); }
document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('exportBtn').addEventListener('click', () => {
  const csv = ['Cliente,Telefono,Aparato,Landing,Fecha,Estado,Valor', ...notices.map(n => [n.name,n.phone,n.device,n.landing,n.date,n.status,getPrice(n.landing,n.device)].join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = 'avisos-demo.csv'; a.click(); URL.revokeObjectURL(a.href);
});
document.getElementById('reportExport').addEventListener('click', () => document.getElementById('exportBtn').click());

function getReportRows() {
  const period=document.getElementById('reportPeriod').value;
  const exact=document.getElementById('reportExactDate').value;
  const from=document.getElementById('reportDateFrom').value;
  const to=document.getElementById('reportDateTo').value;
  const weekday=document.getElementById('reportWeekday').value;
  return notices.filter(n=>{
    const day=new Date(`${n.date}T12:00:00`).getDay();
    return inDatePeriod(n.date,period,exact,from,to)&&(weekday==='all'||day===Number(weekday));
  });
}
function renderReport() {
  const rows=getReportRows();
  const sold=rows.filter(n=>n.status==='Sale');
  const lost=rows.filter(n=>n.status==='No sale');
  const managed=sold.length+lost.length;
  const revenue=sold.reduce((sum,n)=>{const category=deviceCategory(n.device);const rule=priceRules.find(r=>r.landing===n.landing&&r.category===category);return sum+(rule?Number(rule.price):0);},0);
  const counts=landingNames.map(landing=>{const group=rows.filter(n=>n.landing===landing);return {landing,total:group.length,sold:group.filter(n=>n.status==='Sale').length,lost:group.filter(n=>n.status==='No sale').length};});
  const best=[...counts].sort((a,b)=>b.sold-a.sold||b.total-a.total)[0];
  document.getElementById('reportConversion').textContent=`${managed?Math.round(sold.length/managed*100):0} %`;
  document.getElementById('reportManagedCount').textContent=`${managed} avisos gestionados`;
  document.getElementById('reportRevenue').textContent=`${revenue.toLocaleString('es-ES')} €`;
  document.getElementById('reportTotal').textContent=rows.length;
  document.getElementById('reportBestLanding').textContent=best&&best.total?best.landing:'—';
  document.getElementById('reportBestDetail').textContent=best&&best.total?`${best.total} avisos · ${best.sold} sale`:'0 avisos sacados';
  document.getElementById('reportLandingResults').innerHTML=counts.map(c=>`<div class="placeholder-tile"><strong>${escapeHtml(c.landing)}</strong><small>${c.total} avisos · ${c.sold} sale · ${c.lost} no sale</small></div>`).join('');
  const totals=new Map();
  sold.forEach(n=>{const category=deviceCategory(n.device);if(!category)return;const key=`${n.landing} · ${category}`;const rule=priceRules.find(r=>r.landing===n.landing&&r.category===category);const current=totals.get(key)||{amount:0,count:0};current.count++;current.amount+=rule?Number(rule.price):0;totals.set(key,current);});
  const entries=[...totals.entries()].sort((a,b)=>b[1].amount-a[1].amount);
  document.getElementById('reportPriceRows').innerHTML=entries.length?entries.map(([label,value])=>`<div style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #f0f1f5;padding:8px 0;font-size:11px"><span>${escapeHtml(label)} <small style="color:#929aaa">(${value.count})</small></span><strong>${value.amount.toLocaleString('es-ES')} €</strong></div>`).join(''):'<div class="empty">No hay avisos sacados en este filtro.</div>';
}
document.getElementById('reportWeekday').addEventListener('change',renderReport);

function renderPriceRules() {
  const body = document.getElementById('priceRows');
  body.innerHTML = priceRules.map((r,i) => `<tr><td><select data-price-landing="${i}">${landingNames.map(n=>`<option ${r.landing===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></td><td><select data-price-category="${i}">${categoryNames.map(n=>`<option ${r.category===n?'selected':''}>${escapeHtml(n)}</option>`).join('')}</select></td><td><input type="number" min="0" step="0.01" value="${Number(r.price)}" data-price-value="${i}" aria-label="Precio por aviso"/></td><td><button class="mini-delete" data-price-delete="${i}" aria-label="Eliminar tarifa">×</button></td></tr>`).join('');
  body.querySelectorAll('[data-price-landing]').forEach(el=>el.addEventListener('change',e=>{priceRules[+e.target.dataset.priceLanding].landing=e.target.value;persistConfig();renderRows();renderReport();}));
  body.querySelectorAll('[data-price-category]').forEach(el=>el.addEventListener('change',e=>{priceRules[+e.target.dataset.priceCategory].category=e.target.value;persistConfig();renderRows();renderReport();}));
  body.querySelectorAll('[data-price-value]').forEach(el=>el.addEventListener('change',e=>{priceRules[+e.target.dataset.priceValue].price=Number(e.target.value||0);persistConfig();renderRows();renderReport();}));
  body.querySelectorAll('[data-price-delete]').forEach(el=>el.addEventListener('click',e=>{priceRules.splice(+e.target.dataset.priceDelete,1);persistConfig();renderPriceRules();renderRows();renderReport();}));
}
document.getElementById('addPrice').addEventListener('click',()=>{const next=landingNames.flatMap(landing=>categoryNames.map(category=>({landing,category}))).find(candidate=>!priceRules.some(rule=>rule.landing===candidate.landing&&rule.category===candidate.category));if(!next){showToast('Ya hay una tarifa para cada categoría de las landings de ejemplo.');return;}priceRules.push({...next,price:0});persistConfig();renderPriceRules();});
function renderFields() {
  const list=document.getElementById('fieldList');
  list.innerHTML=fields.map((f,i)=>`<div class="field-row"><span>${escapeHtml(f.name)} <small style="color:#929aaa">· ${escapeHtml(f.type)}</small></span><label><input type="checkbox" data-field-toggle="${i}" ${f.enabled?'checked':''}/> Visible</label><button class="mini-delete" data-field-delete="${i}" aria-label="Eliminar ${escapeHtml(f.name)}">×</button></div>`).join('');
  list.querySelectorAll('[data-field-toggle]').forEach(el=>el.addEventListener('change',e=>{fields[+e.target.dataset.fieldToggle].enabled=e.target.checked;persistConfig();syncFields();renderExtraFields();}));
  list.querySelectorAll('[data-field-delete]').forEach(el=>el.addEventListener('click',e=>{fields.splice(+e.target.dataset.fieldDelete,1);persistConfig();renderFields();syncFields();renderExtraFields();}));
}
function syncFields() {
  document.querySelectorAll('[data-field-code]').forEach(el=>{
    const code=el.dataset.fieldCode, setting=fields.find(f=>f.code===code);
    el.hidden=!setting||!setting.enabled;
    const control=el.querySelector('input,select');
    if(control&&(code==='name'||code==='phone')) control.required=!!setting&&setting.enabled;
  });
}
function renderExtraFields() {
  const host=document.getElementById('extraNoticeFields');
  host.innerHTML=fields.filter(f=>f.custom&&f.enabled).map(f=>{const type=f.type==='Fecha'?'date':f.type==='Número'?'number':f.type==='Casilla'?'checkbox':'text';return `<div class="field custom-field-value"><label>${escapeHtml(f.name)}</label><input type="${type}" placeholder="${escapeHtml(f.name)}"/></div>`;}).join('');
}
document.getElementById('addField').addEventListener('click',()=>{
  const input=document.getElementById('newFieldName'), name=input.value.trim();
  if(!name){input.focus();return;}
  fields.push({name,type:document.getElementById('newFieldType').value,enabled:true,custom:true});
  input.value='';persistConfig();renderFields();renderExtraFields();
});
document.getElementById('saveSettings').addEventListener('click',()=>{persistConfig();showToast('Configuración de demostración guardada en este navegador.');});
document.getElementById('period').addEventListener('change',renderRows);
renderRows();renderPriceRules();renderFields();syncFields();renderReport();
